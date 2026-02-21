/**
 * src/contracts/deploy.ts
 * CashScript contract factory — deploys AutoPaySubscription covenants
 * and builds merchant claim / subscriber cancel transactions.
 *
 * Design decisions:
 *   • The server acts as the MERCHANT — it holds the merchant WIF and signs claim txs.
 *   • The subscriber funds the contract manually (sends BCH + mutable NFT to tokenAddress).
 *   • Claim amount = pendingSats (actual API usage) NOT a fixed subscriptionRate.
 *   • Subscriber can always cancel() to reclaim unconsumed balance.
 */

import { Contract, ElectrumNetworkProvider, SignatureTemplate, TransactionBuilder, Network } from 'cashscript';
import { createRequire } from 'node:module';
import { buildNftCommitment, parseNftCommitment, wifToKeyPair, toHex } from '../utils/crypto.js';
import { connectElectrum, getBlockHeight } from '../services/electrumService.js';
import type { SubscriptionRecord } from '../types.js';

// ─── Load compiled artifact ───────────────────────────────────────────────────
const require = createRequire(import.meta.url);
const AutoPaySubscriptionArtifact = require('./AutoPaySubscription.json') as import('@cashscript/utils').Artifact;

// ─── Network provider (lazy singleton) ───────────────────────────────────────

let _provider: ElectrumNetworkProvider | null = null;

export function getProvider(): ElectrumNetworkProvider {
  if (_provider) return _provider;
  const network = (process.env['BCH_NETWORK'] ?? 'chipnet') as typeof Network[keyof typeof Network];
  _provider = new ElectrumNetworkProvider(network);
  return _provider;
}

// ─── Merchant key (lazy) ──────────────────────────────────────────────────────

let _merchantWif: string | null = null;

function getMerchantWif(): string {
  if (_merchantWif) return _merchantWif;
  const wif = process.env['MERCHANT_WIF'];
  if (!wif) throw new Error('MERCHANT_WIF environment variable is not set');
  _merchantWif = wif;
  return wif;
}

// ─── Contract factory ─────────────────────────────────────────────────────────

export interface DeployedContract {
  /** P2SH20 BCH address of the covenant (not token-aware) */
  contractAddress: string;
  /** Token-aware address — the subscriber should send BCH + NFT here */
  tokenAddress: string;
  /** The CashScript Contract instance (use to build claim/cancel txs) */
  contract: Contract;
  merchantPkhHex: string;
  subscriberPkhHex: string;
  intervalBlocks: number;
  maxSats: number;
}

/**
 * Instantiate (or re-instantiate) an AutoPaySubscription contract.
 *
 * Now takes `maxSats` — the absolute ceiling on total sats the merchant
 * can ever claim. Set this to the full deposit for uncapped metered billing.
 */
export function instantiateSubscriptionContract(opts: {
  merchantPkhHex: string;
  subscriberPkhHex: string;
  intervalBlocks: number;
  maxSats: number;
}): DeployedContract {
  const { merchantPkhHex, subscriberPkhHex, intervalBlocks, maxSats } = opts;

  const provider = getProvider();

  const merchantPkh = Uint8Array.from(Buffer.from(merchantPkhHex, 'hex'));
  const subscriberPkh = Uint8Array.from(Buffer.from(subscriberPkhHex, 'hex'));

  const contract = new Contract(
    AutoPaySubscriptionArtifact,
    [merchantPkh, subscriberPkh, BigInt(intervalBlocks), BigInt(maxSats)],
    { provider },
  );

  return {
    contractAddress: contract.address,
    tokenAddress: contract.tokenAddress,
    contract,
    merchantPkhHex,
    subscriberPkhHex,
    intervalBlocks,
    maxSats,
  };
}

/**
 * Build the genesis NFT commitment for the initial funding transaction.
 *
 * Layout (8 bytes):
 *   bytes [0..3]: startBlock     (int32 LE) — treated as lastClaimBlock initially
 *   bytes [4..7]: totalConsumed  (int32 LE) — starts at 0
 */
export function buildGenesisCommitment(startBlock: number): string {
  // totalConsumed starts at 0 — no usage yet
  return buildNftCommitment(startBlock, 0);
}

// ─── Merchant claim transaction (metered billing) ─────────────────────────────

/**
 * Build and broadcast a merchant claim transaction.
 *
 * `pendingSats` is the actual amount consumed by API calls since the last claim,
 * as tracked by usageMeter. The on-chain contract verifies this is ≤ maxSats ceiling.
 *
 * Tx structure:
 *   Input  [0]: contract UTXO (unlocked with claim(pk, sig, pendingSats))
 *   Output [0]: contract (self, updated NFT commitment with new totalConsumed)
 *   Output [1]: merchant P2PKH (exactly pendingSats)
 */
export async function buildAndSendClaimTx(
  record: SubscriptionRecord,
  pendingSats: bigint,
): Promise<{
  txid: string;
  claimedSats: bigint;
  newLastClaimBlock: number;
  newBalance: bigint;
}> {
  if (pendingSats <= 0n) {
    throw new Error('pendingSats must be > 0. No usage to claim yet.');
  }

  const provider = getProvider();
  const merchantKp = wifToKeyPair(getMerchantWif());

  const { merchantPkh, subscriberPkh, intervalBlocks } = record;

  // maxSats = total deposit (full ceiling — merchant can claim all of it over time)
  // Fix: for existing records, balance is strictly the current UTXO balance, not original maxSats.
  // We use 200_000 as default or what was used at genesis. To compute exact address, we need exact args.
  // By using record.tokenAddress directly (above), we bypass constructor arg mismatches!
  const maxSats = record.balance > 0n ? Number(record.balance) : 200_000;

  const { contract } = instantiateSubscriptionContract({
    merchantPkhHex: merchantPkh,
    subscriberPkhHex: subscriberPkh,
    intervalBlocks,
    maxSats,
  });

  // Fetch contract UTXOs from the stored token address where the NFT lives
  // Fall back to contract.tokenAddress for legacy records or missing fields
  const tokenAddress = record.tokenAddress ?? contract.tokenAddress;
  const utxos = await provider.getUtxos(tokenAddress);
  if (utxos.length === 0) {
    throw new Error(`No UTXOs found at contract tokenAddress ${tokenAddress}`);
  }

  const contractUtxo = utxos.find(
    u => u.token?.category?.toLowerCase() === record.tokenCategory.toLowerCase()
      && u.token?.nft?.capability === 'mutable',
  );
  if (!contractUtxo) {
    throw new Error(`Subscription NFT (category: ${record.tokenCategory}) not found in contract UTXOs.`);
  }

  // Decode current NFT state: [lastClaimBlock][totalConsumed]
  const commitment = contractUtxo.token!.nft!.commitment;
  const { lastClaimBlock } = parseNftCommitment(commitment);
  // totalConsumed is bytes [4..7]: read as int
  const commitBuf = Buffer.from(commitment, 'hex');
  const totalConsumed = commitBuf.length >= 8 ? commitBuf.readInt32LE(4) : 0;

  const currentBlock = await getBlockHeight();

  if (currentBlock < lastClaimBlock + intervalBlocks) {
    const nextClaimAt = lastClaimBlock + intervalBlocks;
    throw new Error(
      `Interval not yet elapsed. Next claim after block ${nextClaimAt} (current: ${currentBlock}).`,
    );
  }

  const MINER_FEE = 1500n;
  const inputValue = contractUtxo.satoshis;
  const returnToContract = inputValue - pendingSats - MINER_FEE;

  if (returnToContract < 0n) {
    throw new Error(
      `Insufficient contract balance (${inputValue} sats) to claim ${pendingSats} sats + ${MINER_FEE} fee.`,
    );
  }

  // Build updated NFT commitment:
  //   bytes [0..3] = currentBlock (new lastClaimBlock)
  //   bytes [4..7] = totalConsumed + pendingSats
  const newTotalConsumed = totalConsumed + Number(pendingSats);
  const newCommitmentHex = buildNftCommitment(currentBlock, newTotalConsumed);

  // Build the claim transaction
  const sigTemplate = new SignatureTemplate(merchantKp.privateKey);
  // Pass pendingSats as the third argument to claim(pk, sig, pendingSats)
  const unlocker = contract.unlock.claim(merchantKp.publicKey, sigTemplate, pendingSats);

  const txBuilder = new TransactionBuilder({ provider });
  txBuilder.addInput(contractUtxo, unlocker);
  txBuilder.setLocktime(currentBlock);

  // Output 0: contract self-output with updated NFT commitment
  txBuilder.addOutput({
    to: contract.tokenAddress,
    amount: returnToContract,
    token: {
      amount: 0n,
      category: record.tokenCategory,
      nft: {
        capability: 'mutable',
        commitment: newCommitmentHex,
      },
    },
  });

  // Output 1: merchant receives exactly pendingSats
  txBuilder.addOutput({
    to: record.merchantAddress,
    amount: pendingSats,
  });

  const txDetails = await txBuilder.send();

  return {
    txid: txDetails.txid,
    claimedSats: pendingSats,
    newLastClaimBlock: currentBlock,
    newBalance: returnToContract,
  };
}

// ─── Subscriber cancel (withdraw remaining balance) ───────────────────────────

/**
 * Build and broadcast a subscriber cancel transaction.
 *
 * The subscriber receives the full remaining contract balance back to their wallet.
 * The mutable NFT is deliberately NOT forwarded → subscription is permanently destroyed.
 *
 * Tx structure:
 *   Input  [0]: contract UTXO
 *   Output [0]: subscriber P2PKH (full remaining balance minus miner fee)
 *               No token output → NFT burned / subscription ended.
 */
export async function buildAndSendCancelTx(
  record: SubscriptionRecord,
  subscriberWif: string,
): Promise<{ txid: string; refundedSats: bigint }> {
  const provider = getProvider();
  const subscriberKp = wifToKeyPair(subscriberWif);
  // Re-instantiate the exact same contract. Using record.authorizedSats (which holds the original maxSats ceiling)
  // or falling back to current balance/default if it's missing. This guarantees the unlocker matches the on-chain UTXO exactly.
  const maxSats = record.authorizedSats ? Number(record.authorizedSats) : (record.balance > 0n ? Number(record.balance) : 200_000);

  const { contract } = instantiateSubscriptionContract({
    merchantPkhHex: record.merchantPkh,
    subscriberPkhHex: record.subscriberPkh,
    intervalBlocks: record.intervalBlocks,
    maxSats,
  });

  // Use the stored tokenAddress directly — don't re-derive, constructor args may differ
  const tokenAddress = record.tokenAddress ?? contract.tokenAddress;
  const utxos = await provider.getUtxos(tokenAddress);
  if (utxos.length === 0) {
    throw new Error(`No UTXOs found at contract tokenAddress ${contract.tokenAddress}`);
  }

  const contractUtxo = utxos.find(
    u => u.token?.category?.toLowerCase() === record.tokenCategory.toLowerCase(),
  ) ?? utxos[0]!;

  const MINER_FEE = 1500n;
  const refunded = contractUtxo.satoshis - MINER_FEE;

  const sigTemplate = new SignatureTemplate(subscriberKp.privateKey);
  const unlocker = contract.unlock.cancel(subscriberKp.publicKey, sigTemplate);

  const txBuilder = new TransactionBuilder({ provider });
  txBuilder.addInput(contractUtxo, unlocker);

  // Return all BCH to subscriber; omit token → NFT destroyed
  txBuilder.addOutput({
    to: record.subscriberAddress,
    amount: refunded,
  });

  const txDetails = await txBuilder.send();

  return { txid: txDetails.txid, refundedSats: refunded };
}

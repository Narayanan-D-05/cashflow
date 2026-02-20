/**
 * src/contracts/deploy.ts
 * CashScript contract factory — deploys AutoPaySubscription covenants
 * and builds merchant claim / subscriber cancel transactions.
 *
 * Design decisions:
 *   • The server acts as the MERCHANT — it holds the merchant WIF and signs claim txs.
 *   • The subscriber funds the contract manually (sends BCH + mutable NFT to tokenAddress).
 *   • The server monitors the contract address for funding via Electrum subscriptions.
 */

import { Contract, ElectrumNetworkProvider, SignatureTemplate, TransactionBuilder, Network } from 'cashscript';
import { createRequire } from 'node:module';
import { buildNftCommitment, parseNftCommitment, wifToKeyPair, toHex } from '../utils/crypto.js';
import { connectElectrum, getBlockHeight } from '../services/electrumService.js';
import type { SubscriptionRecord } from '../types.js';

// ─── Load compiled artifact ───────────────────────────────────────────────────
// cashc compiled the contract to JSON; we import it using CJS require
// (resolveJsonModule in tsconfig handles this for ESM-compatible import).
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
  /** Merchant and subscriber PKH baked into the covenant, hex */
  merchantPkhHex: string;
  subscriberPkhHex: string;
  intervalBlocks: number;
}

/**
 * Instantiate (or re-instantiate) an AutoPaySubscription contract for the
 * given merchant/subscriber pair and interval parameters.
 *
 * This does NOT broadcast any transaction — it just returns the deterministic
 * contract address derived from the constructor arguments.
 *
 * The genesis funding transaction (which also mints the subscription NFT)
 * must be built by the subscriber's wallet (see `buildSubscriptionFundingInstructions`).
 */
export function instantiateSubscriptionContract(opts: {
  merchantPkhHex: string;
  subscriberPkhHex: string;
  intervalBlocks: number;
}): DeployedContract {
  const { merchantPkhHex, subscriberPkhHex, intervalBlocks } = opts;

  const provider = getProvider();

  const merchantPkh   = Uint8Array.from(Buffer.from(merchantPkhHex,   'hex'));
  const subscriberPkh = Uint8Array.from(Buffer.from(subscriberPkhHex, 'hex'));

  const contract = new Contract(
    AutoPaySubscriptionArtifact,
    [merchantPkh, subscriberPkh, BigInt(intervalBlocks)],
    { provider },
  );

  return {
    contractAddress:  contract.address,
    tokenAddress:     contract.tokenAddress,
    contract,
    merchantPkhHex,
    subscriberPkhHex,
    intervalBlocks,
  };
}

/**
 * Build the hex-encoded NFT commitment for the genesis (initial) funding
 * transaction.  The subscriber must embed this commitment in the mutable NFT
 * they send to `tokenAddress`.
 *
 * @param startBlock      — current BCH block height (the "last claim" block)
 * @param authorizedSats  — max sats merchant may claim per interval
 */
export function buildGenesisCommitment(startBlock: number, authorizedSats: number): string {
  return buildNftCommitment(startBlock, authorizedSats);
}

// ─── Merchant claim transaction ───────────────────────────────────────────────

/**
 * Build and broadcast a merchant claim transaction.
 *
 * Preconditions:
 *   1. The contract UTXO holds BCH + a mutable NFT with the subscription state.
 *   2. At least `intervalBlocks` have passed since `lastClaimBlock`.
 *
 * Tx structure:
 *   Input  [0]: contract UTXO (unlocked with claim(merchantPk, merchantSig))
 *   Output [0]: contract (self, with updated NFT commitment)
 *   Output [1]: merchant P2PKH (authorizedSats)
 */
export async function buildAndSendClaimTx(record: SubscriptionRecord): Promise<{
  txid: string;
  claimedSats: bigint;
  newLastClaimBlock: number;
  newBalance: bigint;
}> {
  const provider   = getProvider();
  const merchantKp = wifToKeyPair(getMerchantWif());

  const { merchantPkh, subscriberPkh, intervalBlocks } = record;

  // Re-instantiate the contract to get the correct address + unlock functions
  const { contract } = instantiateSubscriptionContract({
    merchantPkhHex:   merchantPkh,
    subscriberPkhHex: subscriberPkh,
    intervalBlocks,
  });

  // Fetch contract UTXOs
  const utxos = await contract.getUtxos();
  if (utxos.length === 0) {
    throw new Error(`No UTXOs found at contract address ${contract.address}`);
  }

  // Find the UTXO carrying the subscription mutable NFT
  const contractUtxo = utxos.find(
    u => u.token?.category?.toLowerCase() === record.tokenCategory.toLowerCase()
      && u.token?.nft?.capability === 'mutable',
  );
  if (!contractUtxo) {
    throw new Error(`Subscription NFT (category: ${record.tokenCategory}) not found in contract UTXOs.`);
  }

  // Decode current NFT state
  const commitment = contractUtxo.token!.nft!.commitment;
  const { lastClaimBlock, authorizedSats } = parseNftCommitment(commitment);

  // Fetch current block height to use as tx locktime
  const currentBlock = await getBlockHeight();

  if (currentBlock < lastClaimBlock + intervalBlocks) {
    const nextClaimAt = lastClaimBlock + intervalBlocks;
    throw new Error(
      `Interval not yet elapsed. Next claim after block ${nextClaimAt} (current: ${currentBlock}).`,
    );
  }

  const MINER_FEE    = 1500n;
  const claimedSats  = BigInt(authorizedSats);
  const inputValue   = contractUtxo.satoshis;
  const returnToContract = inputValue - claimedSats - MINER_FEE;

  if (returnToContract < 0n) {
    throw new Error(
      `Insufficient contract balance (${inputValue} sats) to claim ${claimedSats} sats + ${MINER_FEE} fee.`,
    );
  }

  // Build updated NFT commitment: new lastClaimBlock = currentBlock
  const newCommitmentHex = buildNftCommitment(currentBlock, authorizedSats);

  // Build the claim transaction
  const sigTemplate = new SignatureTemplate(merchantKp.privateKey);
  const unlocker    = contract.unlock.claim(merchantKp.publicKey, sigTemplate);

  const txBuilder = new TransactionBuilder({ provider });

  txBuilder.addInput(contractUtxo, unlocker);
  txBuilder.setLocktime(currentBlock);

  // Output 0: contract self-output with updated NFT
  txBuilder.addOutput({
    to:     contract.tokenAddress,
    amount: returnToContract,
    token:  {
      amount:   0n,
      category: record.tokenCategory,
      nft: {
        capability: 'mutable',
        commitment: newCommitmentHex,
      },
    },
  });

  // Output 1: merchant receives authorized payment
  txBuilder.addOutput({
    to:     record.merchantAddress,
    amount: claimedSats,
  });

  const txDetails = await txBuilder.send();

  return {
    txid:              txDetails.txid,
    claimedSats,
    newLastClaimBlock: currentBlock,
    newBalance:        returnToContract,
  };
}

// ─── Subscriber cancel transaction ───────────────────────────────────────────

/**
 * Build and broadcast a subscriber cancel transaction.
 *
 * The subscriber WIF must be provided at call time (never stored server-side
 * in production — this endpoint is for demo/SDK integration purposes).
 *
 * Tx structure:
 *   Input  [0]: contract UTXO
 *   Output [0]: subscriber P2PKH (full remaining balance minus fee)
 *               NFT is NOT forwarded → subscription destroyed.
 */
export async function buildAndSendCancelTx(
  record: SubscriptionRecord,
  subscriberWif: string,
): Promise<{ txid: string; refundedSats: bigint }> {
  const provider    = getProvider();
  const subscriberKp = wifToKeyPair(subscriberWif);

  const { contract } = instantiateSubscriptionContract({
    merchantPkhHex:   record.merchantPkh,
    subscriberPkhHex: record.subscriberPkh,
    intervalBlocks:   record.intervalBlocks,
  });

  const utxos = await contract.getUtxos();
  if (utxos.length === 0) {
    throw new Error(`No UTXOs found at contract address ${contract.address}`);
  }

  const contractUtxo = utxos.find(
    u => u.token?.category?.toLowerCase() === record.tokenCategory.toLowerCase(),
  ) ?? utxos[0];

  const MINER_FEE = 1500n;
  const refunded  = contractUtxo.satoshis - MINER_FEE;

  const sigTemplate = new SignatureTemplate(subscriberKp.privateKey);
  const unlocker    = contract.unlock.cancel(subscriberKp.publicKey, sigTemplate);

  const txBuilder = new TransactionBuilder({ provider });
  txBuilder.addInput(contractUtxo, unlocker);

  // Return all BCH to subscriber; omit token from output → NFT destroyed
  txBuilder.addOutput({
    to:     record.subscriberAddress,
    amount: refunded,
  });

  const txDetails = await txBuilder.send();

  return { txid: txDetails.txid, refundedSats: refunded };
}

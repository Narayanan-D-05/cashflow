#!/usr/bin/env tsx
/**
 * scripts/chipnet-e2e.ts
 * ─────────────────────────────────────────────────────────────
 * Live ChipNet End-to-End Integration Test
 *
 * This script drives the full CashFlow402 subscription lifecycle
 * against a REAL running server connected to the BCH ChipNet testnet.
 *
 * Pre-requisites:
 *   1. npm run dev                        ← server running on localhost:3000
 *   2. MERCHANT_WIF configured in .env   ← funded ChipNet wallet
 *   3. A CashToken-aware wallet (e.g. Cashonize) for the subscriber side
 *      — OR — set SUBSCRIBER_WIF in .env to let the script auto-fund.
 *
 * Usage:
 *   npx tsx scripts/chipnet-e2e.ts
 *
 * Steps:
 *   1. Generate subscriber keypair (or use SUBSCRIBER_WIF from env)
 *   2. Call POST /deploy-subscription → get contract address + funding URI
 *   3. Print funding instructions (user sends BCH from their wallet)
 *   4. Wait for user to broadcast the funding tx and enter the txid
 *   5. Call POST /subscription/fund-confirm → activate subscription
 *   6. Call GET  /subscription/status → verify active + canClaimNow
 *   7. Wait until canClaimNow == true (polls every 10 s)
 *   8. Call POST /subscription/claim → pull the first payment
 *   9. Print receipt
 */

import 'dotenv/config';
import axios, { AxiosError } from 'axios';
import { generateKeyPair } from '../src/utils/crypto.js';
import * as readline from 'node:readline';

const BASE_URL = process.env['API_URL'] ?? 'http://localhost:3000';
const NETWORK  = (process.env['BCH_NETWORK'] ?? 'chipnet') as 'chipnet' | 'mainnet';
const POLL_MS  = 10_000;  // 10 s between status polls

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(`\n  ${msg}`); }
function ok(msg: string)  { console.log(`  ✅  ${msg}`); }
function warn(msg: string){ console.log(`  ⚠️   ${msg}`); }
function err(msg: string) { console.error(`  ❌  ${msg}`); }

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(`\n  ${question}: `, ans => { rl.close(); resolve(ans.trim()); }));
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function hr() { console.log('\n' + '─'.repeat(60)); }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  CashFlow402 — Live ChipNet End-to-End Integration Test    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n  Server : ${BASE_URL}`);
  console.log(`  Network: ${NETWORK}`);

  // ─── Step 0: Server health check ──────────────────────────────────────────
  hr();
  console.log('  Step 0 › Checking server...');
  try {
    const { data } = await axios.get(`${BASE_URL}/health`);
    ok(`Server is up — v${data.version as string}`);
  } catch {
    err(`Cannot reach ${BASE_URL}/health — is the server running? (npm run dev)`);
    process.exit(1);
  }

  // ─── Step 1: Subscriber keypair ───────────────────────────────────────────
  hr();
  console.log('  Step 1 › Subscriber wallet');
  let subscriberAddress: string;
  let subscriberWif: string | undefined = process.env['SUBSCRIBER_WIF'];

  if (subscriberWif) {
    // Import from env — derive address from it
    const { wifToKeyPair } = await import('../src/utils/crypto.js');
    const kp = wifToKeyPair(subscriberWif, NETWORK);
    subscriberAddress = kp.address;
    log(`Using existing SUBSCRIBER_WIF from .env`);
    ok(`Subscriber address: ${subscriberAddress}`);
  } else {
    // Auto-generate (subscriber needs to fund externally)
    const kp = generateKeyPair(NETWORK);
    subscriberAddress = kp.address;
    subscriberWif = kp.wif;
    ok(`Generated new subscriber address: ${subscriberAddress}`);
    warn(`Save this WIF if you want to cancel later: ${kp.wif}`);
    warn(`Fund this address from the ChipNet faucet: https://tbch.googol.cash`);
  }

  // ─── Step 2: Deploy subscription ──────────────────────────────────────────
  hr();
  console.log('  Step 2 › Deploy subscription covenant...');

  let deployResp: {
    contractAddress: string;
    tokenAddress: string;
    tokenCategory: string;
    intervalBlocks: number;
    authorizedSats: number;
    genesisCommitment: string;
    fundingUri: string;
    startBlock: number;
    fundingInstructions: string;
  };

  try {
    const { data } = await axios.post(`${BASE_URL}/deploy-subscription`, {
      subscriberAddress,
      intervalBlocks: parseInt(process.env['DEFAULT_INTERVAL_BLOCKS'] ?? '5', 10), // small for testing
      authorizedSats: parseInt(process.env['DEFAULT_AUTHORIZED_SATS'] ?? '10000', 10),
    });
    deployResp = data as typeof deployResp;
  } catch (e) {
    const ae = e as AxiosError;
    err(`deploy-subscription failed: ${JSON.stringify(ae.response?.data)}`);
    process.exit(1);
  }

  ok(`Contract address : ${deployResp.contractAddress}`);
  ok(`Token address    : ${deployResp.tokenAddress}`);
  ok(`Interval (blocks): ${deployResp.intervalBlocks}`);
  ok(`Authorized sats  : ${deployResp.authorizedSats}`);
  ok(`Start block      : ${deployResp.startBlock}`);
  log(`Genesis commitment (NFT data): ${deployResp.genesisCommitment}`);

  // ─── Step 3: Funding instructions ─────────────────────────────────────────
  hr();
  console.log('  Step 3 › Fund the subscription contract');
  console.log('\n  You must broadcast a BCH transaction that:');
  console.log(`    • Sends ≥ ${deployResp.authorizedSats * 4} sats to:`);
  console.log(`      ${deployResp.tokenAddress}`);
  console.log(`    • Includes a MUTABLE CashToken NFT with commitment:`);
  console.log(`      ${deployResp.genesisCommitment}`);
  console.log('\n  BIP-21 URI (use a CashToken-aware wallet like Cashonize):');
  console.log(`    ${deployResp.fundingUri}`);
  console.log('\n  Hint: The NFT token category will equal the txid of the first OP_RETURN');
  console.log('        input in your funding transaction (ChipNet CashToken genesis rule).');
  console.log('\n  ChipNet faucet: https://tbch.googol.cash');
  console.log('  Cashonize:      https://cashonize.com');

  // ─── Step 4: Collect txid + tokenCategory ────────────────────────────────
  hr();
  const txid         = await prompt('Enter the funding transaction txid');
  const tokenCategory = await prompt('Enter the NFT token category (32-byte hex, usually = txid)');

  if (!txid || !tokenCategory) {
    err('txid and tokenCategory are required to continue.');
    process.exit(1);
  }

  // ─── Step 5: Confirm funding ──────────────────────────────────────────────
  hr();
  console.log('  Step 5 › Confirming subscription funding on-chain...');

  try {
    const { data } = await axios.post(`${BASE_URL}/subscription/fund-confirm`, {
      txid,
      tokenCategory,
      contractAddress: deployResp.contractAddress,
    });
    ok(`Subscription activated!`);
    ok(`Balance  : ${(data as { balance: string }).balance} sats`);
    ok(`Category : ${tokenCategory}`);
  } catch (e) {
    const ae = e as AxiosError;
    err(`fund-confirm failed: ${JSON.stringify(ae.response?.data)}`);
    warn('Make sure the tx has at least 0 confirmations on ChipNet before retrying.');
    process.exit(1);
  }

  // ─── Step 6: Status check ─────────────────────────────────────────────────
  hr();
  console.log('  Step 6 › Checking subscription status...');

  interface StatusResp {
    status: string;
    canClaimNow: boolean;
    currentBlock: number;
    nextClaimAfterBlock: number;
    blocksUntilNextClaim: number;
    balance: string;
  }

  const printStatus = (s: StatusResp) => {
    log(`Status            : ${s.status}`);
    log(`Balance           : ${s.balance} sats`);
    log(`Current block     : ${s.currentBlock}`);
    log(`Next claim after  : block ${s.nextClaimAfterBlock}`);
    log(`Blocks remaining  : ${s.blocksUntilNextClaim}`);
    log(`Can claim now?    : ${s.canClaimNow ? '✅ yes' : '⏳ not yet'}`);
  };

  let status: StatusResp;
  try {
    const { data } = await axios.get(`${BASE_URL}/subscription/status/${deployResp.contractAddress}`);
    status = data as StatusResp;
    printStatus(status);
  } catch (e) {
    const ae = e as AxiosError;
    err(`status check failed: ${JSON.stringify(ae.response?.data)}`);
    process.exit(1);
  }

  // ─── Step 7: Wait until claimable ────────────────────────────────────────
  if (!status.canClaimNow) {
    hr();
    console.log(`  Step 7 › Waiting for block ${status.nextClaimAfterBlock} (interval of ${deployResp.intervalBlocks} blocks)...`);
    console.log(`  Polling every ${POLL_MS / 1000}s. Ctrl+C to abort.\n`);

    while (!status.canClaimNow) {
      await sleep(POLL_MS);
      try {
        const { data } = await axios.get(`${BASE_URL}/subscription/status/${deployResp.contractAddress}`);
        status = data as StatusResp;
        process.stdout.write(`  Block ${status.currentBlock}/${status.nextClaimAfterBlock} — ${status.blocksUntilNextClaim} remaining\r`);
      } catch {
        process.stdout.write('  (poll error, retrying…)\r');
      }
    }
    console.log('\n');
    ok(`Claim window reached! (block ${status.currentBlock})`);
  } else {
    ok('Claim window is already open!');
  }

  // ─── Step 8: Claim ────────────────────────────────────────────────────────
  hr();
  console.log('  Step 8 › Broadcasting claim transaction...');

  try {
    const { data } = await axios.post(`${BASE_URL}/subscription/claim`, {
      contractAddress: deployResp.contractAddress,
      tokenCategory,
    });
    const claim = data as { txid: string; claimedSats: number; nextClaimAfterBlock: number };
    ok(`Claim successful!`);
    ok(`Claim txid        : ${claim.txid}`);
    ok(`Claimed           : ${claim.claimedSats} sats`);
    ok(`Next claim after  : block ${claim.nextClaimAfterBlock}`);
    log(`View on ChipNet explorer: https://chipnet.chaingraph.cash/tx/${claim.txid}`);
  } catch (e) {
    const ae = e as AxiosError;
    err(`claim failed: ${JSON.stringify(ae.response?.data)}`);
    process.exit(1);
  }

  // ─── Step 9: Summary ──────────────────────────────────────────────────────
  hr();
  console.log('\n  🎉  End-to-end test COMPLETE!\n');
  console.log(`  Subscription: ${deployResp.contractAddress}`);
  console.log(`  Category    : ${tokenCategory}`);
  console.log(`  Interval    : ${deployResp.intervalBlocks} blocks`);
  console.log(`  Per-claim   : ${deployResp.authorizedSats} sats\n`);
  console.log('  To cancel, run:');
  console.log(`    curl -X POST ${BASE_URL}/subscription/cancel \\`);
  console.log(`      -H "Content-Type: application/json" \\`);
  console.log(`      -d '{"contractAddress":"${deployResp.contractAddress}","subscriberWif":"${subscriberWif}"}'\n`);
}

main().catch(e => {
  console.error('\n❌  Uncaught error:', e);
  process.exit(1);
});

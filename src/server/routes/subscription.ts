/**
 * src/server/routes/subscription.ts
 * Routes for the CashToken subscription lifecycle.
 *
 * POST /deploy-subscription
 *   Deploy a new AutoPaySubscription covenant and return funding instructions.
 *
 * POST /subscription/fund-confirm
 *   Subscriber notifies the server that the funding tx has been broadcast.
 *   Server verifies on-chain and activates the subscription.
 *
 * GET /subscription/status/:contractAddress
 *   Get the current on-chain and in-memory status of a subscription.
 *
 * POST /subscription/claim
 *   Merchant claims one interval's authorized payment from the contract.
 *
 * POST /subscription/cancel
 *   Subscriber cancels a subscription (requires subscriber WIF for signing).
 *
 * GET /subscription/verify
 *   Issue a subscription JWT for a valid active subscription.
 *   Client provides tokenCategory in X-Subscription-Token or query param.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  instantiateSubscriptionContract,
  buildGenesisCommitment,
  buildAndSendClaimTx,
  buildAndSendCancelTx,
  getProvider,
} from '../../contracts/deploy.js';
import {
  addSubscription,
  getByAddress,
  getByCategory,
  getAllSubscriptions,
  updateSubscription,
  setStatus,
  recordClaim,
} from '../../services/subscriptionStore.js';
import { verifySubscriptionFunding } from '../../services/txVerifier.js';
import { subscribeToAddress } from '../../services/electrumService.js';
import { signSubscriptionToken } from '../../utils/jwt.js';
import { buildSubscriptionFundingUri } from '../../utils/bip21.js';
import { addressToPkh, toHex, wifToKeyPair, generateKeyPair } from '../../utils/crypto.js';
import { getBlockHeight } from '../../services/electrumService.js';
import { buildAndBroadcastGenesisFundingTx } from '../../utils/buildFundingTx.js';
import { getPlan, incrementSubscribers } from '../../services/merchantPlanStore.js';
import { resetPendingSats } from '../../services/usageMeter.js';
import type {
  DeploySubscriptionBody,
  DeploySubscriptionResponse,
  ClaimPaymentBody,
  ClaimPaymentResponse,
} from '../../types.js';

export const subscriptionRouter = Router();

// ─── POST /deploy-subscription ────────────────────────────────────────────────

/**
 * Deploy a new AutoPaySubscription covenant.
 *
 * The contract address is derived deterministically from the constructor
 * arguments (merchantPkh, subscriberPkh, intervalBlocks) — no on-chain
 * transaction is required at this step.
 *
 * The subscriber must then fund the contract by sending BCH + a mutable NFT
 * to the returned `tokenAddress`.  The NFT's commitment must be the returned
 * `genesisCommitment` hex.
 */
subscriptionRouter.post('/deploy-subscription', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as DeploySubscriptionBody & { planId?: string };

  if (!body.subscriberAddress) {
    res.status(400).json({ error: 'subscriberAddress is required.' });
    return;
  }

  const merchantWif = process.env['MERCHANT_WIF'];
  if (!merchantWif) {
    res.status(500).json({ error: 'MERCHANT_WIF not configured on this server.' });
    return;
  }

  const network = process.env['BCH_NETWORK'] ?? 'chipnet';

  // ── Resolve plan parameters ───────────────────────────────────────────────
  // If a planId is provided, use that plan's settings.
  // Otherwise fall back to body fields → env defaults.
  let intervalBlocks: number;
  let authorizedSats: number;
  let planId: string | undefined;

  if (body.planId) {
    const plan = getPlan(body.planId);
    if (!plan) {
      res.status(404).json({ error: `Plan '${body.planId}' not found.` });
      return;
    }
    if (plan.status !== 'active') {
      res.status(409).json({ error: `Plan '${plan.name}' is not active (status: ${plan.status}).` });
      return;
    }
    intervalBlocks = plan.intervalBlocks;
    authorizedSats = plan.authorizedSats;
    planId = plan.planId;
  } else {
    intervalBlocks = body.intervalBlocks ?? parseInt(process.env['DEFAULT_INTERVAL_BLOCKS'] ?? '144', 10);
    authorizedSats = body.authorizedSats ?? parseInt(process.env['DEFAULT_AUTHORIZED_SATS'] ?? '50000', 10);
  }

  // Derive merchant and subscriber PKH from their addresses / WIF
  let merchantPkhHex: string;
  let merchantAddress: string;
  try {
    const kp = wifToKeyPair(merchantWif, network);
    merchantPkhHex = toHex(kp.pkh);
    merchantAddress = kp.address;
  } catch (e) {
    res.status(500).json({ error: `Merchant key error: ${String(e)}` });
    return;
  }

  let subscriberPkhHex: string;
  try {
    subscriberPkhHex = toHex(addressToPkh(body.subscriberAddress));
  } catch (e) {
    res.status(400).json({ error: `Invalid subscriberAddress: ${String(e)}` });
    return;
  }

  // Instantiate the covenant (deterministic, no broadcast)
  const deployed = instantiateSubscriptionContract({ merchantPkhHex, subscriberPkhHex, intervalBlocks, maxSats: authorizedSats });

  // Build the genesis NFT commitment: lastClaimBlock = currentBlock, totalConsumed = 0
  const currentBlock = await getBlockHeight();
  const genesisCommitment = buildGenesisCommitment(currentBlock);

  // The NFT category will be the txid of the genesis (funding) input.
  // We cannot know it ahead of time — it is determined when the subscriber
  // broadcasts the funding tx.  We store the record in 'pending_funding' state
  // and activate it after the subscriber calls POST /subscription/fund-confirm.
  const placeholderCategory = `pending_${deployed.contractAddress.slice(-12)}`;

  const now = new Date().toISOString();
  addSubscription({
    contractAddress: deployed.contractAddress,
    tokenAddress: deployed.tokenAddress,
    tokenCategory: placeholderCategory,
    merchantPkh: merchantPkhHex,
    subscriberPkh: subscriberPkhHex,
    subscriberAddress: body.subscriberAddress,
    merchantAddress,
    intervalBlocks,
    authorizedSats: BigInt(authorizedSats),
    lastClaimBlock: currentBlock,
    balance: 0n,
    status: 'pending_funding',
    createdAt: now,
    updatedAt: now,
  });

  // Track subscriber count on the plan
  if (planId) incrementSubscribers(planId);

  // Subscribe to contract address changes so we catch the funding tx in real time
  subscribeToAddress(deployed.tokenAddress, async (scripthash, status) => {
    console.log(`[Webhook] Contract ${deployed.contractAddress.slice(0, 12)}… received tx (status: ${status})`);
  }).catch(err => console.error('[Electrum] subscribeToAddress error:', err));

  const fundingUri = buildSubscriptionFundingUri({
    contractTokenAddress: deployed.tokenAddress,
    depositSats: authorizedSats * 4, // suggest 4 intervals up front
    tokenCategory: genesisCommitment,  // placeholder; real category = genesis txid
  });

  const response: DeploySubscriptionResponse = {
    contractAddress: deployed.contractAddress,
    tokenAddress: deployed.tokenAddress,
    tokenCategory: placeholderCategory,
    intervalBlocks,
    authorizedSats,
    fundingInstructions: [
      `Send BCH ( ≥ ${authorizedSats * 4} sats recommended ) to: ${deployed.tokenAddress}`,
      `Include a mutable NFT with commitment: ${genesisCommitment}`,
      `After broadcasting, call POST /subscription/fund-confirm with { txid, tokenCategory, contractAddress }`,
    ].join('\n'),
  };

  res.status(201).json({
    ...response,
    genesisCommitment,
    fundingUri,
    startBlock: currentBlock,
    planId: planId ?? null,
    hint: 'Use the CashFlow402 SDK or a CashToken-aware wallet to build the genesis funding transaction.',
    nextStep: 'Fund the contract, then call POST /subscription/auto-fund or POST /subscription/fund-confirm.',
  });
});

// ─── POST /subscription/fund-confirm ─────────────────────────────────────────

/**
 * Subscriber notifies the server that the funding transaction has been broadcast.
 * The server verifies the payment on-chain and activates the subscription.
 *
 * Body: { txid, tokenCategory, contractAddress }
 */
subscriptionRouter.post('/subscription/fund-confirm', async (req: Request, res: Response): Promise<void> => {
  const { txid, tokenCategory, contractAddress } = req.body as {
    txid: string;
    tokenCategory: string;
    contractAddress: string;
  };

  if (!txid || !tokenCategory || !contractAddress) {
    res.status(400).json({ error: 'Body must include { txid, tokenCategory, contractAddress }.' });
    return;
  }

  const record = getByAddress(contractAddress);
  if (!record) {
    res.status(404).json({ error: `No subscription found for contractAddress: ${contractAddress}` });
    return;
  }

  if (record.status === 'active') {
    res.status(200).json({ message: 'Subscription is already active.', record });
    return;
  }

  // Deploy instantiation to get the tokenAddress for verification
  const deployed = instantiateSubscriptionContract({
    merchantPkhHex: record.merchantPkh,
    subscriberPkhHex: record.subscriberPkh,
    intervalBlocks: record.intervalBlocks,
    maxSats: Number(record.authorizedSats),
  });

  const verification = await verifySubscriptionFunding({
    txid,
    contractTokenAddress: deployed.tokenAddress,
    expectedTokenCategory: tokenCategory,
    minFundingSats: Number(record.authorizedSats),
  });

  if (!verification.verified) {
    res.status(402).json({
      error: 'Subscription funding verification failed.',
      detail: verification.error,
    });
    return;
  }

  // Activate: update the subscription record with real tokenCategory + balance
  const updated = updateSubscription(contractAddress, {
    tokenCategory: tokenCategory,
    balance: BigInt(verification.amountSats),
    status: 'active',
  });

  res.status(200).json({
    message: 'Subscription activated.',
    contractAddress,
    tokenCategory,
    balance: verification.amountSats,
    commitment: verification.commitment,
    record: updated,
  });
});

// ─── GET /subscription/status/:contractAddress ────────────────────────────────

subscriptionRouter.get('/subscription/status/:contractAddress', async (req: Request, res: Response): Promise<void> => {
  const contractAddress = req.params['contractAddress'] as string;
  const record = getByAddress(contractAddress);

  if (!record) {
    res.status(404).json({ error: `No subscription found for: ${contractAddress}` });
    return;
  }

  // Optionally refresh balance from chain
  try {
    const provider = getProvider();
    const utxos = await provider.getUtxos(contractAddress);
    const total = utxos.reduce((sum, u) => sum + u.satoshis, 0n);
    updateSubscription(contractAddress, { balance: total });
  } catch {
    // Non-fatal: return cached balance
  }

  const currentBlock = await getBlockHeight().catch(() => 0);
  const nextClaimAfter = record.lastClaimBlock + record.intervalBlocks;
  const satsUntilClaim = Math.max(0, nextClaimAfter - currentBlock);

  res.status(200).json({
    ...record,
    balance: record.balance.toString(),
    authorizedSats: record.authorizedSats.toString(),
    currentBlock,
    nextClaimAfterBlock: nextClaimAfter,
    blocksUntilNextClaim: satsUntilClaim,
    canClaimNow: currentBlock >= nextClaimAfter,
  });
});

// ─── GET /subscription/list ───────────────────────────────────────────────────

subscriptionRouter.get('/subscription/list', (_req: Request, res: Response): void => {
  const all = getAllSubscriptions().map(r => ({
    ...r,
    balance: r.balance.toString(),
    authorizedSats: r.authorizedSats.toString(),
  }));
  res.status(200).json({ subscriptions: all, count: all.length });
});

// ─── POST /subscription/claim ─────────────────────────────────────────────────

/**
 * Merchant claims one interval's authorized payment from a subscription contract.
 *
 * Body: { contractAddress, tokenCategory }
 *
 * The server signs the claim transaction using the MERCHANT_WIF in env.
 */
subscriptionRouter.post('/subscription/claim', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as ClaimPaymentBody;

  if (!body.contractAddress || !body.tokenCategory) {
    res.status(400).json({ error: 'Body must include { contractAddress, tokenCategory }.' });
    return;
  }

  const record = getByAddress(body.contractAddress)
    ?? getByCategory(body.tokenCategory);

  if (!record) {
    res.status(404).json({ error: 'Subscription not found.' });
    return;
  }

  if (record.status !== 'active') {
    res.status(409).json({
      error: `Cannot claim: subscription status is '${record.status}'.`,
      status: record.status,
    });
    return;
  }

  // ── Metered billing: claim exactly what the user consumed ──────────────────
  const { getUsage } = await import('../../services/usageMeter.js');
  const usage = getUsage(record.tokenCategory);
  const pendingSats = usage?.pendingSats ?? 0n;

  if (pendingSats <= 0n) {
    res.status(400).json({
      error: 'No pending usage to claim. Users have not consumed any API credits since the last claim.',
      pendingSats: '0',
      hint: 'Users need to make API calls via X-Subscription-Token before you can claim.',
    });
    return;
  }

  const result = await buildAndSendClaimTx(record, pendingSats);

  // Update local store
  recordClaim(
    record.contractAddress,
    result.newLastClaimBlock,
    result.newBalance,
  );

  // Reset pending sats to zero after successful on-chain settlement
  resetPendingSats(record.tokenCategory, result.claimedSats);

  const response: ClaimPaymentResponse = {
    txid: result.txid,
    claimedSats: Number(result.claimedSats),
    nextClaimAfterBlock: result.newLastClaimBlock + record.intervalBlocks,
  };

  res.status(200).json(response);
});

// ─── POST /subscription/cancel ────────────────────────────────────────────────

/**
 * Subscriber cancels a subscription.
 *
 * Body: { contractAddress, subscriberWif }
 *
 * ⚠️  subscriberWif is passed in the request body for hackathon demo purposes.
 *     In production, the cancel transaction must be built client-side and
 *     only the signed raw tx is submitted.
 */
subscriptionRouter.post('/subscription/cancel', async (req: Request, res: Response): Promise<void> => {
  const { contractAddress, subscriberWif } = req.body as {
    contractAddress: string;
    subscriberWif: string;
  };

  if (!contractAddress || !subscriberWif) {
    res.status(400).json({ error: 'Body must include { contractAddress, subscriberWif }.' });
    return;
  }

  const record = getByAddress(contractAddress);
  if (!record) {
    res.status(404).json({ error: 'Subscription not found.' });
    return;
  }

  const result = await buildAndSendCancelTx(record, subscriberWif);

  setStatus(contractAddress, 'cancelled');

  res.status(200).json({
    message: 'Subscription cancelled. Remaining balance refunded.',
    txid: result.txid,
    refundedSats: result.refundedSats.toString(),
  });
});

// ─── GET /subscription/verify ─────────────────────────────────────────────────

/**
 * Issue a subscription JWT if the caller has an active subscription.
 *
 * The tokenCategory can be provided via:
 *   - Header: X-Subscription-Token: <tokenCategory>
 *   - Query:  ?tokenCategory=<hex>
 */
subscriptionRouter.get('/subscription/verify', (req: Request, res: Response): void => {
  const rawTokenHeader = req.headers['x-subscription-token'];
  const tokenCategory =
    (Array.isArray(rawTokenHeader) ? rawTokenHeader[0] : rawTokenHeader)
    ?? (req.query['tokenCategory'] as string | undefined);

  if (!tokenCategory) {
    res.status(400).json({
      error: 'Provide tokenCategory via X-Subscription-Token header or ?tokenCategory= query param.',
    });
    return;
  }

  const record = getByCategory(tokenCategory);
  if (!record) {
    res.status(404).json({ error: `No subscription found for tokenCategory: ${tokenCategory}` });
    return;
  }

  if (record.status !== 'active') {
    res.status(402).json({
      error: `Subscription is not active (current status: ${record.status}).`,
      status: record.status,
    });
    return;
  }

  const accessToken = signSubscriptionToken({
    tokenCategory,
    contractAddress: record.contractAddress,
  });

  res.status(200).json({
    accessToken,
    expiresInSeconds: parseInt(process.env['JWT_EXPIRY_SUBSCRIPTION'] ?? '3600', 10),
    tokenCategory,
  });
});

// ─── POST /subscription/create-session ───────────────────────────────────────

/**
 * Demo-friendly: generate a fresh subscriber keypair + deploy a subscription.
 * Returns the subscriber address to fund, plus full contract details.
 * The subscriber WIF is returned so /subscription/auto-fund can use it.
 *
 * ⚠️  Returning a WIF to the client is demo-only. In production,
 *     the subscriber builds + signs the funding tx client-side.
 */
subscriptionRouter.post('/subscription/create-session', async (req: Request, res: Response): Promise<void> => {
  const merchantWif = process.env['MERCHANT_WIF'];
  if (!merchantWif) {
    res.status(500).json({ error: 'MERCHANT_WIF not configured.' });
    return;
  }

  const network = (process.env['BCH_NETWORK'] ?? 'chipnet') as 'chipnet' | 'mainnet';
  const intervalBlocks = parseInt(process.env['DEFAULT_INTERVAL_BLOCKS'] ?? '1', 10);
  // depositSats = total credits user pre-funds; merchant claims from this pool as usage accrues
  const depositSats = parseInt(process.env['DEFAULT_DEPOSIT_SATS'] ?? '200000', 10);
  // maxSats = safety ceiling for total lifetime claims (= depositSats for full metered billing)
  const maxSats = depositSats;

  // Generate subscriber keypair
  const subscriberKp = generateKeyPair(network);
  const subscriberAddress = subscriberKp.address;
  const subscriberWif = subscriberKp.wif;

  // Derive merchant PKH
  let merchantPkhHex: string;
  let merchantAddress: string;
  try {
    const kp = wifToKeyPair(merchantWif, network);
    merchantPkhHex = toHex(kp.pkh);
    merchantAddress = kp.address;
  } catch (e) {
    res.status(500).json({ error: `Merchant key error: ${String(e)}` });
    return;
  }

  const subscriberPkhHex = toHex(addressToPkh(subscriberAddress));

  // Instantiate contract (deterministic, no broadcast) — now 4-arg with maxSats
  const deployed = instantiateSubscriptionContract({ merchantPkhHex, subscriberPkhHex, intervalBlocks, maxSats });

  const currentBlock = await getBlockHeight();
  // Genesis commitment: lastClaimBlock = currentBlock, totalConsumed = 0
  const genesisCommitment = buildGenesisCommitment(currentBlock);

  const placeholderCategory = `pending_${deployed.contractAddress.slice(-12)}`;
  const now = new Date().toISOString();

  addSubscription({
    contractAddress: deployed.contractAddress,
    tokenAddress: deployed.tokenAddress,
    tokenCategory: placeholderCategory,
    merchantPkh: merchantPkhHex,
    subscriberPkh: subscriberPkhHex,
    subscriberAddress,
    merchantAddress,
    intervalBlocks,
    authorizedSats: BigInt(maxSats),  // maxSats stored as the ceiling
    lastClaimBlock: currentBlock,
    balance: 0n,
    status: 'pending_funding',
    createdAt: now,
    updatedAt: now,
  });

  res.status(201).json({
    subscriberAddress,
    subscriberWif,           // ⚠️ demo only
    contractAddress: deployed.contractAddress,
    tokenAddress: deployed.tokenAddress,
    genesisCommitment,
    depositSats,
    maxSats,
    intervalBlocks,
    startBlock: currentBlock,
    hint: `Fund ${subscriberAddress} with at least ${depositSats + 5000} sats from https://tbch.googol.cash, then call POST /subscription/auto-fund`,
  });
});

// ─── POST /subscription/auto-fund ────────────────────────────────────────────

/**
 * Build + broadcast the genesis funding transaction server-side.
 * Requires the subscriber's WIF (from /subscription/create-session).
 * After broadcast, activates the subscription automatically.
 *
 * Body: { contractAddress, subscriberWif }
 */
subscriptionRouter.post('/subscription/auto-fund', async (req: Request, res: Response): Promise<void> => {
  const { contractAddress, subscriberWif } = req.body as {
    contractAddress: string;
    subscriberWif: string;
  };

  if (!contractAddress || !subscriberWif) {
    res.status(400).json({ error: 'Body must include { contractAddress, subscriberWif }.' });
    return;
  }

  const record = getByAddress(contractAddress);
  if (!record) {
    res.status(404).json({ error: `No subscription found for contractAddress: ${contractAddress}` });
    return;
  }

  if (record.status === 'active') {
    res.status(200).json({ message: 'Subscription already active.', contractAddress });
    return;
  }

  const network = (process.env['BCH_NETWORK'] ?? 'chipnet') as 'chipnet' | 'mainnet';
  let subscriberKp: ReturnType<typeof wifToKeyPair>;
  try {
    subscriberKp = wifToKeyPair(subscriberWif, network);
  } catch (e) {
    res.status(400).json({ error: `Invalid subscriberWif: ${String(e)}` });
    return;
  }

  // Re-instantiate contract to get tokenAddress — pass maxSats (= authorizedSats ceiling stored at create-session)
  const maxSats = Number(record.authorizedSats);
  const deployed = instantiateSubscriptionContract({
    merchantPkhHex: record.merchantPkh,
    subscriberPkhHex: record.subscriberPkh,
    intervalBlocks: record.intervalBlocks,
    maxSats,
  });

  const currentBlock = await getBlockHeight();
  // Genesis commitment: totalConsumed starts at 0
  const genesisCommitment = buildGenesisCommitment(currentBlock);
  const depositSats = record.authorizedSats;

  const provider = getProvider();

  let txid: string;
  let tokenCategory: string;
  try {
    ({ txid, tokenCategory } = await buildAndBroadcastGenesisFundingTx({
      subscriberPrivKey: subscriberKp.privateKey,
      subscriberPubKey: subscriberKp.publicKey,
      subscriberPkh: Buffer.from(subscriberKp.pkh),
      subscriberAddress: subscriberKp.address,
      contractTokenAddress: deployed.tokenAddress,
      genesisCommitment,
      depositSats,
      provider,
    }));
  } catch (e) {
    res.status(500).json({ error: `Failed to build/broadcast funding tx: ${String(e)}` });
    return;
  }

  // Activate the subscription
  updateSubscription(contractAddress, {
    tokenCategory,
    tokenAddress: deployed.tokenAddress,
    balance: depositSats,
    status: 'active',
  });

  console.log(`[Subscription] Auto-funded ${contractAddress.slice(0, 16)}… txid: ${txid}`);

  res.status(200).json({
    message: 'Subscription funded and activated.',
    txid,
    tokenCategory,
    contractAddress,
    depositSats: depositSats.toString(),
    authorizedSats: record.authorizedSats.toString(),
    intervalBlocks: record.intervalBlocks,
  });
});

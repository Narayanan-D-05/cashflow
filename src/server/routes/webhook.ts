/**
 * src/server/routes/webhook.ts
 * Webhook endpoints for external notification of on-chain events.
 *
 * POST /webhook/tx-confirmed
 *   Receives a notification when a transaction is confirmed on-chain.
 *   Used to update subscription status after the funding tx gets its first confirmation.
 *
 * POST /webhook/block
 *   Called when a new BCH block is found.  Server refreshes subscription balances
 *   and checks if any claims are newly eligible.
 *
 * The webhook secret (WEBHOOK_SECRET env var) is validated on every call to
 * prevent unauthorized state mutations.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { getByAddress, getByCategory, updateSubscription } from '../../services/subscriptionStore.js';
import { verifySubscriptionFunding } from '../../services/txVerifier.js';
import { instantiateSubscriptionContract } from '../../contracts/deploy.js';

export const webhookRouter = Router();

// ─── Authentication ───────────────────────────────────────────────────────────

function validateWebhookSecret(req: Request): boolean {
  const secret = process.env['WEBHOOK_SECRET'];
  if (!secret) return true; // No secret configured → allow all (dev mode only)

  const provided = req.headers['x-webhook-secret'] as string | undefined;
  if (!provided) return false;

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(provided));
  } catch {
    return false;
  }
}

// ─── POST /webhook/tx-confirmed ───────────────────────────────────────────────

/**
 * Notify the server that a transaction affecting a known contract address
 * has been confirmed.
 *
 * Body: {
 *   txid: string,
 *   contractAddress?: string,
 *   tokenCategory?: string,
 *   confirmations: number
 * }
 */
webhookRouter.post('/webhook/tx-confirmed', async (req: Request, res: Response): Promise<void> => {
  if (!validateWebhookSecret(req)) {
    res.status(401).json({ error: 'Invalid or missing webhook secret.' });
    return;
  }

  const { txid, contractAddress, tokenCategory, confirmations } = req.body as {
    txid: string;
    contractAddress?: string;
    tokenCategory?: string;
    confirmations: number;
  };

  if (!txid) {
    res.status(400).json({ error: 'txid is required.' });
    return;
  }

  // Locate the affected subscription
  const record = contractAddress
    ? getByAddress(contractAddress)
    : tokenCategory
      ? getByCategory(tokenCategory)
      : undefined;

  if (!record) {
    // Unknown contract — nothing to do
    res.status(200).json({ message: 'No matching subscription found; ignoring.' });
    return;
  }

  console.log(
    `[Webhook] tx-confirmed: txid=${txid.slice(0, 12)}… ` +
    `contract=${record.contractAddress.slice(0, 12)}… ` +
    `confs=${confirmations}`,
  );

  // If subscription is still pending funding, try to activate it
  if (record.status === 'pending_funding' && tokenCategory) {
    const deployed = instantiateSubscriptionContract({
      merchantPkhHex: record.merchantPkh,
      subscriberPkhHex: record.subscriberPkh,
      intervalBlocks: record.intervalBlocks,
    });

    const result = await verifySubscriptionFunding({
      txid,
      contractTokenAddress: deployed.tokenAddress,
      expectedTokenCategory: tokenCategory,
      minFundingSats: Number(record.authorizedSats),
    });

    if (result.verified) {
      updateSubscription(record.contractAddress, {
        tokenCategory: tokenCategory,
        balance: BigInt(result.amountSats),
        status: 'active',
      });
      console.log(`[Webhook] Subscription ${record.contractAddress.slice(0, 12)}… ACTIVATED via webhook.`);
    }
  }

  // If subscription is active, refresh the balance from the verification result
  if (record.status === 'active') {
    // Non-blocking balance refresh: query UTXOs
    const deployed = instantiateSubscriptionContract({
      merchantPkhHex: record.merchantPkh,
      subscriberPkhHex: record.subscriberPkh,
      intervalBlocks: record.intervalBlocks,
    });

    try {
      const { getProvider } = await import('../../contracts/deploy.js');
      const provider = getProvider();
      const utxos = await provider.getUtxos(deployed.contract.tokenAddress);
      const balance = utxos.reduce((sum, u) => sum + u.satoshis, 0n);
      updateSubscription(record.contractAddress, { balance });

      // Auto-expire if contract has zero balance
      if (balance === 0n) {
        updateSubscription(record.contractAddress, { status: 'expired' });
        console.log(`[Webhook] Subscription ${record.contractAddress.slice(0, 12)}… expired (zero balance).`);
      }
    } catch (e) {
      console.warn(`[Webhook] Could not refresh balance for ${record.contractAddress.slice(0, 12)}…: ${String(e)}`);
    }
  }

  res.status(200).json({ message: 'Webhook processed.', contractAddress: record.contractAddress });
});

// ─── POST /webhook/block ──────────────────────────────────────────────────────

/**
 * Called when a new BCH block is found.
 * Logs the block height and can be used to trigger background maintenance.
 *
 * Body: { height: number, hash: string }
 */
webhookRouter.post('/webhook/block', (req: Request, res: Response): void => {
  if (!validateWebhookSecret(req)) {
    res.status(401).json({ error: 'Invalid or missing webhook secret.' });
    return;
  }

  const { height, hash } = req.body as { height: number; hash: string };

  console.log(`[Webhook] New BCH block: height=${height} hash=${(hash ?? '').slice(0, 12)}…`);

  // TODO (post-MVP): iterate all active subscriptions and auto-claim or send alerts

  res.status(200).json({ message: 'Block notification received.', height });
});

/**
 * src/server/routes/payment.ts
 * Routes for the per-call HTTP-402 payment flow.
 *
 * POST /verify-payment
 *   - Client submits { txid, nonce } after paying the 402 challenge.
 *   - Server verifies the payment on-chain and issues a short-lived JWT.
 *
 * GET /payment/challenge
 *   - Manually request a payment challenge (useful for debugging / SDK testing).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { verifyPerCallPayment } from '../../services/txVerifier.js';
import { signPerCallToken } from '../../utils/jwt.js';
import { buildPerCallUri } from '../../utils/bip21.js';
import {
  consumeNonce,
  storeNonce,
} from '../../services/subscriptionStore.js';
import type { VerifyPaymentBody, VerifyPaymentResponse } from '../../types.js';

export const paymentRouter = Router();

// ─── POST /verify-payment ─────────────────────────────────────────────────────

/**
 * Verify a per-call BCH payment and issue a JWT access token.
 *
 * Request body:
 *   { txid: string, nonce: string }
 *
 * Response 200:
 *   { accessToken: string, expiresInSeconds: number }
 *
 * Response 400:
 *   { error: string }
 *
 * Response 402:
 *   { error: string, detail: string }
 */
paymentRouter.post('/verify-payment', async (req: Request, res: Response): Promise<void> => {
  const { txid, nonce } = req.body as VerifyPaymentBody;

  if (!txid || !nonce) {
    res.status(400).json({ error: 'Request body must include { txid, nonce }.' });
    return;
  }

  // Look up and consume the nonce (single-use)
  const nonceRecord = consumeNonce(nonce);
  if (!nonceRecord) {
    res.status(400).json({
      error: 'Invalid or expired nonce.',
      hint:  'Nonces are single-use and expire after 2 minutes. Re-request the 402 endpoint to get a fresh challenge.',
    });
    return;
  }

  // Verify the payment on-chain
  const result = await verifyPerCallPayment({
    txid,
    merchantAddress: nonceRecord.merchantAddress,
    requiredSats:    nonceRecord.amountSats,
  });

  if (!result.verified) {
    res.status(402).json({
      error:  'Payment verification failed.',
      detail: result.error ?? 'Unknown verification error.',
    });
    return;
  }

  // Issue JWT
  const expiresInSeconds = parseInt(process.env['JWT_EXPIRY_PERCALL'] ?? '60', 10);
  const accessToken      = signPerCallToken({
    txid,
    amountSats: result.amountSats,
    nonce,
  });

  const response: VerifyPaymentResponse = { accessToken, expiresInSeconds };
  res.status(200).json(response);
});

// ─── GET /payment/challenge ───────────────────────────────────────────────────

/**
 * Manually generate a payment challenge for a given API path.
 * Useful for debugging and SDK integration without hitting a protected endpoint.
 *
 * Query params:
 *   path       — the API path the payment will unlock (default: /api/premium)
 *   amountSats — override the default rate (optional)
 */
paymentRouter.get('/payment/challenge', (req: Request, res: Response): void => {
  const merchantAddress = process.env['MERCHANT_ADDRESS'];
  if (!merchantAddress) {
    res.status(500).json({ error: 'MERCHANT_ADDRESS not configured on this server.' });
    return;
  }

  const apiPath    = typeof req.query['path']       === 'string' ? req.query['path'] : '/api/premium';
  const amountSats = typeof req.query['amountSats'] === 'string'
    ? parseInt(req.query['amountSats'], 10)
    : parseInt(process.env['DEFAULT_PERCALL_RATE_SATS'] ?? '100', 10);

  const nonce      = uuidv4();
  const expiresAt  = Date.now() + 120_000;

  storeNonce(nonce, {
    merchantAddress,
    amountSats,
    apiPath,
    expiresAt,
    consumed: false,
  });

  const paymentUri = buildPerCallUri({ merchantAddress, amountSats, nonce, apiPath });
  const host       = `${req.protocol}://${req.get('host')}`;

  res.status(200).json({
    paymentUri,
    amountSats,
    merchantAddress,
    nonce,
    verifyUrl:  `${host}/verify-payment`,
    expiresAt,
  });
});

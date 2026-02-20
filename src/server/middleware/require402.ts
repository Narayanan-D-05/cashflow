/**
 * src/server/middleware/require402.ts
 * HTTP-402 Payment Required middleware.
 *
 * Intercepts requests to protected API routes and checks for a valid
 * CashFlow402 access token.  If none is present (or it is expired),
 * it returns a 402 response containing the BCH payment challenge.
 *
 * Usage (in Express router):
 *   import { require402 } from '../middleware/require402.js';
 *   router.get('/premium/*', require402, myHandler);
 */

import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { verifyAccessToken } from '../../utils/jwt.js';
import { buildPerCallUri } from '../../utils/bip21.js';
import { storeNonce } from '../../services/subscriptionStore.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMerchantAddress(): string {
  const addr = process.env['MERCHANT_ADDRESS'];
  if (!addr) throw new Error('MERCHANT_ADDRESS environment variable is not set');
  return addr;
}

function getDefaultRateSats(): number {
  return parseInt(process.env['DEFAULT_PERCALL_RATE_SATS'] ?? '100', 10);
}

function getHostUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

// ─── Token extraction ─────────────────────────────────────────────────────────

/**
 * Extract the Bearer token from the Authorization header or the
 * `X-Payment-Token` header.
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  const xToken = req.headers['x-payment-token'];
  if (typeof xToken === 'string') {
    return xToken;
  }
  return null;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * require402 — Main HTTP-402 access-control middleware.
 *
 * Flow:
 *   1. Extract JWT from Authorization: Bearer <token> or X-Payment-Token header.
 *   2. Verify the JWT (must be a valid percall or subscription token).
 *   3. If valid → attach decoded payload to `req.paymentToken` and call next().
 *   4. If missing/invalid → issue a new payment challenge and return 402.
 */
export function require402(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);

  if (token) {
    const payload = verifyAccessToken(token);
    if (payload) {
      // Attach decoded payload so downstream handlers can inspect it
      (req as Request & { paymentToken: typeof payload }).paymentToken = payload;
      next();
      return;
    }
  }

  // No valid token — issue a payment challenge
  const merchantAddress = getMerchantAddress();
  const amountSats      = getDefaultRateSats();
  const nonce           = uuidv4();
  const challengeTtlMs  = 120_000; // 2 minutes
  const expiresAt       = Date.now() + challengeTtlMs;

  // Record the nonce so /verify-payment can look it up
  storeNonce(nonce, {
    merchantAddress,
    amountSats,
    apiPath: req.path,
    expiresAt,
    consumed: false,
  });

  const paymentUri = buildPerCallUri({
    merchantAddress,
    amountSats,
    nonce,
    apiPath: req.path,
  });

  const host = getHostUrl(req);

  // Set the standard HTTP-402 response header
  res.set('Payment-Required', paymentUri);

  res.status(402).json({
    error:       'Payment Required',
    paymentUri,
    amountSats,
    merchantAddress,
    nonce,
    verifyUrl:  `${host}/verify-payment`,
    expiresAt,
    instructions: [
      `1. Send exactly ${amountSats} satoshis to ${merchantAddress}`,
      `2. POST { txid, nonce } to ${host}/verify-payment`,
      `3. Retry this request with the returned JWT in Authorization: Bearer <token>`,
    ],
  });
}

/**
 * requireSubscription402 — Middleware variant that only accepts subscription tokens.
 *
 * Used for routes that are exclusively subscription-gated (not per-call).
 */
export function requireSubscription402(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);

  if (token) {
    const payload = verifyAccessToken(token);
    if (payload?.type === 'subscription') {
      (req as Request & { paymentToken: typeof payload }).paymentToken = payload;
      next();
      return;
    }
  }

  res.status(402).json({
    error: 'Active subscription required.',
    hint:  'Deploy a subscription at POST /deploy-subscription and fund the returned contract address.',
  });
}

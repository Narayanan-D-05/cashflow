/**
 * src/utils/jwt.ts
 * JWT signing and verification for CashFlow402 access tokens.
 *
 * Two token types are issued:
 *   - percall:       short-lived (60s default) after a verified BCH micropayment
 *   - subscription:  longer-lived (1hr default) for active CashToken subscriptions
 */

import jwt from 'jsonwebtoken';
import type { AccessTokenPayload, PerCallTokenPayload, SubscriptionTokenPayload } from '../types.js';

// ─── Config ───────────────────────────────────────────────────────────────────

function jwtSecret(): string {
  const s = process.env['JWT_SECRET'];
  if (!s) throw new Error('JWT_SECRET environment variable is not set');
  return s;
}

function percallExpiry(): number {
  return parseInt(process.env['JWT_EXPIRY_PERCALL'] ?? '60', 10);
}

function subscriptionExpiry(): number {
  return parseInt(process.env['JWT_EXPIRY_SUBSCRIPTION'] ?? '3600', 10);
}

// ─── Sign ─────────────────────────────────────────────────────────────────────

/**
 * Issue a short-lived JWT after a per-call BCH micropayment is verified.
 */
export function signPerCallToken(payload: Omit<PerCallTokenPayload, 'type'>): string {
  const claims: PerCallTokenPayload = { type: 'percall', ...payload };
  return jwt.sign(claims, jwtSecret(), { expiresIn: percallExpiry() });
}

/**
 * Issue a longer-lived JWT for an active CashToken subscription.
 */
export function signSubscriptionToken(payload: Omit<SubscriptionTokenPayload, 'type'>): string {
  const claims: SubscriptionTokenPayload = { type: 'subscription', ...payload };
  return jwt.sign(claims, jwtSecret(), { expiresIn: subscriptionExpiry() });
}

// ─── Verify ───────────────────────────────────────────────────────────────────

/**
 * Verify and decode a CashFlow402 access token.
 * Returns null if the token is invalid or expired.
 */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, jwtSecret()) as AccessTokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Decode a token without verifying the signature (for logging/debugging).
 * DO NOT use this for access decisions.
 */
export function decodeAccessToken(token: string): AccessTokenPayload | null {
  try {
    return jwt.decode(token) as AccessTokenPayload;
  } catch {
    return null;
  }
}

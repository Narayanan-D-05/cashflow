/**
 * src/services/subscriptionStore.ts
 * In-memory store for subscription records.
 *
 * In an MVP / hackathon context this is sufficient — the source of truth is
 * always the BCH blockchain.  A production deployment would persist this to
 * PostgreSQL / SQLite, refreshing from on-chain state on startup.
 *
 * Keyed on contractAddress (primary) and tokenCategory (secondary index).
 */

import type { SubscriptionRecord, SubscriptionStatus } from '../types.js';

// ─── Store ────────────────────────────────────────────────────────────────────

const byAddress:  Map<string, SubscriptionRecord> = new Map();
const byCategory: Map<string, string>             = new Map(); // tokenCategory → contractAddress

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function addSubscription(record: SubscriptionRecord): void {
  byAddress.set(record.contractAddress,  record);
  byCategory.set(record.tokenCategory,   record.contractAddress);
}

export function getByAddress(contractAddress: string): SubscriptionRecord | undefined {
  return byAddress.get(contractAddress);
}

export function getByCategory(tokenCategory: string): SubscriptionRecord | undefined {
  const addr = byCategory.get(tokenCategory);
  return addr ? byAddress.get(addr) : undefined;
}

export function getAllSubscriptions(): SubscriptionRecord[] {
  return Array.from(byAddress.values());
}

/**
 * Partially update a subscription record.
 * Only the provided fields are merged; all other fields are preserved.
 */
export function updateSubscription(
  contractAddress: string,
  patch: Partial<Omit<SubscriptionRecord, 'contractAddress'>>,
): SubscriptionRecord | null {
  const existing = byAddress.get(contractAddress);
  if (!existing) return null;

  const updated: SubscriptionRecord = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  byAddress.set(contractAddress, updated);
  return updated;
}

/**
 * Convenience: change only the status field.
 */
export function setStatus(contractAddress: string, status: SubscriptionStatus): boolean {
  const record = byAddress.get(contractAddress);
  if (!record) return false;
  record.status    = status;
  record.updatedAt = new Date().toISOString();
  return true;
}

/**
 * Record a successful merchant claim: update lastClaimBlock and balance.
 */
export function recordClaim(
  contractAddress: string,
  newLastClaimBlock: number,
  newBalance: bigint,
): boolean {
  const record = byAddress.get(contractAddress);
  if (!record) return false;
  record.lastClaimBlock = newLastClaimBlock;
  record.balance        = newBalance;
  record.updatedAt      = new Date().toISOString();
  return true;
}

/**
 * Remove a subscription from the store (on cancel or expiry).
 */
export function removeSubscription(contractAddress: string): boolean {
  const record = byAddress.get(contractAddress);
  if (!record) return false;
  byCategory.delete(record.tokenCategory);
  byAddress.delete(contractAddress);
  return true;
}

// ─── Challenge nonce store (per-call payment challenges) ─────────────────────
// Nonces expire quickly (60 seconds). We use a simple TTL map.

interface NonceRecord {
  merchantAddress: string;
  amountSats: number;
  apiPath: string;
  expiresAt: number;  // Unix ms
  consumed: boolean;
}

const nonceStore: Map<string, NonceRecord> = new Map();

export function storeNonce(nonce: string, record: NonceRecord): void {
  nonceStore.set(nonce, record);
  // Auto-clean after TTL
  setTimeout(() => nonceStore.delete(nonce), record.expiresAt - Date.now() + 1000);
}

export function getNonce(nonce: string): NonceRecord | undefined {
  const rec = nonceStore.get(nonce);
  if (!rec) return undefined;
  if (Date.now() > rec.expiresAt) {
    nonceStore.delete(nonce);
    return undefined;
  }
  return rec;
}

export function consumeNonce(nonce: string): NonceRecord | null {
  const rec = getNonce(nonce);
  if (!rec || rec.consumed) return null;
  rec.consumed = true;
  return rec;
}

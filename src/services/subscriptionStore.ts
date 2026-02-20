/**
 * src/services/subscriptionStore.ts
 * JSON file-backed store for subscription records.
 *
 * Persists to data/subscriptions.json on every mutation so subscriptions
 * survive server restarts.  The source of truth is always the BCH blockchain;
 * this file is a local cache that avoids re-scanning on every startup.
 *
 * BigInt values (balance, authorizedSats) are serialised as decimal strings
 * and deserialised back to BigInt on startup.
 *
 * The nonce store remains in-memory only — nonces are short-lived (60 s)
 * and intentionally need not survive restarts.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SubscriptionRecord, SubscriptionStatus } from '../types.js';

// ─── Persistence helpers ──────────────────────────────────────────────────────

const __dir     = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dir, '../../data');
const DATA_FILE = join(DATA_DIR, 'subscriptions.json');

/** Serialisable form: BigInt fields stored as decimal strings */
interface PersistedRecord {
  contractAddress:   string;
  tokenCategory:     string;
  merchantPkh:       string;
  subscriberPkh:     string;
  subscriberAddress: string;
  merchantAddress:   string;
  intervalBlocks:    number;
  authorizedSats:    string;   // BigInt → string
  lastClaimBlock:    number;
  balance:           string;   // BigInt → string
  status:            SubscriptionStatus;
  createdAt:         string;
  updatedAt:         string;
}

function toRecord(p: PersistedRecord): SubscriptionRecord {
  return {
    ...p,
    authorizedSats: BigInt(p.authorizedSats),
    balance:        BigInt(p.balance),
  };
}

function toPersisted(r: SubscriptionRecord): PersistedRecord {
  return {
    ...r,
    authorizedSats: r.authorizedSats.toString(),
    balance:        r.balance.toString(),
  };
}

function loadFromDisk(): Map<string, SubscriptionRecord> {
  const map = new Map<string, SubscriptionRecord>();
  if (!existsSync(DATA_FILE)) return map;
  try {
    const raw       = readFileSync(DATA_FILE, 'utf-8');
    const persisted = JSON.parse(raw) as PersistedRecord[];
    for (const p of persisted) map.set(p.contractAddress, toRecord(p));
    console.log(`[Store] Loaded ${map.size} subscription(s) from ${DATA_FILE}`);
  } catch (e) {
    console.warn('[Store] Could not parse subscriptions.json — starting fresh:', String(e));
  }
  return map;
}

function saveToDisk(data: Map<string, SubscriptionRecord>): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const persisted: PersistedRecord[] = Array.from(data.values()).map(toPersisted);
    writeFileSync(DATA_FILE, JSON.stringify(persisted, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Store] Failed to persist subscriptions.json:', String(e));
  }
}

// ─── Store — load from disk on module init ────────────────────────────────────

const byAddress:  Map<string, SubscriptionRecord> = loadFromDisk();
const byCategory: Map<string, string>             = new Map(); // tokenCategory → contractAddress

// Rebuild secondary index from loaded data
for (const [, rec] of byAddress) byCategory.set(rec.tokenCategory, rec.contractAddress);

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function addSubscription(record: SubscriptionRecord): void {
  byAddress.set(record.contractAddress, record);
  byCategory.set(record.tokenCategory,  record.contractAddress);
  saveToDisk(byAddress);
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

  // Refresh secondary index if tokenCategory changed
  if (patch.tokenCategory && patch.tokenCategory !== existing.tokenCategory) {
    byCategory.delete(existing.tokenCategory);
    byCategory.set(patch.tokenCategory, contractAddress);
  }

  byAddress.set(contractAddress, updated);
  saveToDisk(byAddress);
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
  saveToDisk(byAddress);
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
  saveToDisk(byAddress);
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
  saveToDisk(byAddress);
  return true;
}

// ─── Challenge nonce store (in-memory only — short TTL) ──────────────────────

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

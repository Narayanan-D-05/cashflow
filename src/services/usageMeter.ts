/**
 * src/services/usageMeter.ts
 * Router402 per-call usage metering for CashFlow402.
 *
 * Each API call via a subscription deducts `costSats` from the subscription's
 * tracked balance.  Deductions are:
 *   • Applied immediately to the in-memory balance (so access is denied when the
 *     subscription runs dry — before the next on-chain claim settles).
 *   • Accumulated in `pendingDeductions` until the merchant calls `/subscription/claim`,
 *     which settles the accumulated sats on-chain in one transaction.
 *
 * This implements the Router402 pattern described in HTTP/1.1 RFC 7235 extended
 * usage: instead of one payment per call, the router checks the pre-funded
 * contract balance and drains it call-by-call.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir     = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dir, '../../data');
const USAGE_FILE = join(DATA_DIR, 'usage.json');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UsageRecord {
  /** ISO 8601 timestamp of the API call */
  timestamp: string;
  /** API path that was accessed */
  apiPath: string;
  /** Sats deducted for this call */
  costSats: number;
  /** Optional request ID for tracing */
  requestId?: string;
}

export interface SubscriptionUsage {
  /** CashToken category of the subscription */
  tokenCategory: string;
  /** Contract address of the subscription covenant */
  contractAddress: string;
  /** Accumulated sats used since last claim (not yet settled on-chain) */
  pendingSats: bigint;
  /** Total sats used lifetime */
  totalSats: bigint;
  /** Per-call usage log (last 100 entries) */
  recentCalls: UsageRecord[];
  /** ISO 8601 of last deduction */
  lastUsedAt: string;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

interface PersistedUsage {
  tokenCategory: string;
  contractAddress: string;
  pendingSats: string;
  totalSats: string;
  recentCalls: UsageRecord[];
  lastUsedAt: string;
}

function loadUsageFromDisk(): Map<string, SubscriptionUsage> {
  const map = new Map<string, SubscriptionUsage>();
  if (!existsSync(USAGE_FILE)) return map;
  try {
    const raw = readFileSync(USAGE_FILE, 'utf-8');
    const arr = JSON.parse(raw) as PersistedUsage[];
    for (const p of arr) {
      map.set(p.tokenCategory, {
        ...p,
        pendingSats: BigInt(p.pendingSats),
        totalSats:   BigInt(p.totalSats),
      });
    }
  } catch (e) {
    console.warn('[UsageMeter] Could not parse usage.json — starting fresh:', String(e));
  }
  return map;
}

function saveUsageToDisk(data: Map<string, SubscriptionUsage>): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const arr: PersistedUsage[] = Array.from(data.values()).map(u => ({
      ...u,
      pendingSats: u.pendingSats.toString(),
      totalSats:   u.totalSats.toString(),
    }));
    writeFileSync(USAGE_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (e) {
    console.error('[UsageMeter] Failed to persist usage.json:', String(e));
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

const usageStore = loadUsageFromDisk();

// ─── API ──────────────────────────────────────────────────────────────────────

/**
 * Record an API call deduction against a subscription.
 *
 * Returns the updated pending sats. Throws if the subscription has
 * insufficient remaining balance (tracked balance < costSats).
 *
 * @param tokenCategory   — CashToken category of the active subscription
 * @param contractAddress — Contract address (for reference)
 * @param currentBalance  — Current on-chain + in-flight balance (from SubscriptionRecord)
 * @param costSats        — Sats to deduct for this call
 * @param apiPath         — The API path requested
 * @param requestId       — Optional trace ID
 */
export function recordUsage(opts: {
  tokenCategory: string;
  contractAddress: string;
  currentBalance: bigint;
  costSats: number;
  apiPath: string;
  requestId?: string;
}): { pendingSats: bigint; remainingBalance: bigint } {
  const { tokenCategory, contractAddress, currentBalance, costSats, apiPath, requestId } = opts;

  const cost = BigInt(costSats);

  // Get or create usage tracker
  let usage = usageStore.get(tokenCategory);
  if (!usage) {
    usage = {
      tokenCategory,
      contractAddress,
      pendingSats:  0n,
      totalSats:    0n,
      recentCalls:  [],
      lastUsedAt:   new Date().toISOString(),
    };
    usageStore.set(tokenCategory, usage);
  }

  // The effective available balance = on-chain balance - already pending deductions
  const effectiveBalance = currentBalance - usage.pendingSats;
  if (effectiveBalance < cost) {
    throw new Error(
      `Subscription balance exhausted. ` +
      `Effective balance: ${effectiveBalance} sats, cost: ${cost} sats. ` +
      `Please top up the subscription contract.`,
    );
  }

  // Deduct
  usage.pendingSats += cost;
  usage.totalSats   += cost;
  usage.lastUsedAt   = new Date().toISOString();

  const call: UsageRecord = {
    timestamp: usage.lastUsedAt,
    apiPath,
    costSats,
    requestId,
  };

  usage.recentCalls.unshift(call);
  if (usage.recentCalls.length > 100) usage.recentCalls.length = 100;

  saveUsageToDisk(usageStore);

  return {
    pendingSats:      usage.pendingSats,
    remainingBalance: currentBalance - usage.pendingSats,
  };
}

/**
 * Get current usage for a subscription.
 */
export function getUsage(tokenCategory: string): SubscriptionUsage | undefined {
  return usageStore.get(tokenCategory);
}

/**
 * Get all usage records (for merchant dashboard).
 */
export function getAllUsage(): SubscriptionUsage[] {
  return Array.from(usageStore.values()).map(u => ({
    ...u,
    pendingSats: u.pendingSats,
    totalSats:   u.totalSats,
  }));
}

/**
 * Reset pending sats after a successful on-chain claim.
 * Called by the claim route after buildAndSendClaimTx succeeds.
 */
export function resetPendingSats(tokenCategory: string, claimedSats: bigint): void {
  const usage = usageStore.get(tokenCategory);
  if (!usage) return;

  // Reduce pending by the claimed amount (may not match exactly if claim covers multiple periods)
  usage.pendingSats = usage.pendingSats > claimedSats ? usage.pendingSats - claimedSats : 0n;
  saveUsageToDisk(usageStore);
}

/**
 * Get total pending sats across all subscriptions for a given merchant.
 * Used for the merchant dashboard summary.
 */
export function getTotalPendingSats(): bigint {
  let total = 0n;
  for (const usage of usageStore.values()) {
    total += usage.pendingSats;
  }
  return total;
}

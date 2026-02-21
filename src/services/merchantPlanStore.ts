/**
 * src/services/merchantPlanStore.ts
 * Merchant subscription plan registry.
 *
 * A "Plan" is the merchant-side configuration for a subscription offering.
 * Each plan gets a unique planId, and when a subscriber buys it they get
 * a unique CashToken NFT category (the tokenCategory of their contract UTXO).
 *
 * Flow:
 *   1. Merchant creates a plan (POST /merchant/plan) → gets planId
 *   2. Subscriber buys the plan (POST /deploy-subscription?planId=...) → gets NFT
 *   3. Router checks the subscriber's NFT category matches an active plan
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, '../../data');
const PLAN_FILE = join(DATA_DIR, 'plans.json');

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlanStatus = 'active' | 'paused' | 'archived';

export interface MerchantPlan {
    /** UUID identifying this plan */
    planId: string;
    /** Human-readable name */
    name: string;
    /** Description of what access this plan grants */
    description: string;
    /** Satoshis to authorize per billing interval */
    authorizedSats: number;
    /** BCH block interval between billing cycles (144 ≈ 1 day) */
    intervalBlocks: number;
    /** Sats charged per API call (Router402 deduction rate) */
    perCallSats: number;
    /** Which API paths this plan grants access to (glob patterns) */
    allowedPaths: string[];
    /** Plan lifecycle status */
    status: PlanStatus;
    /** Merchant BCH address receiving payments */
    merchantAddress: string;
    /** Number of active subscribers */
    subscriberCount: number;
    /** ISO 8601 creation timestamp */
    createdAt: string;
    /** ISO 8601 last-updated timestamp */
    updatedAt: string;
}

export interface CreatePlanOptions {
    name: string;
    description?: string;
    authorizedSats: number;
    intervalBlocks?: number;
    perCallSats?: number;
    allowedPaths?: string[];
    merchantAddress: string;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function loadPlans(): Map<string, MerchantPlan> {
    const map = new Map<string, MerchantPlan>();
    if (!existsSync(PLAN_FILE)) return map;
    try {
        const raw = readFileSync(PLAN_FILE, 'utf-8');
        const arr = JSON.parse(raw) as MerchantPlan[];
        for (const p of arr) map.set(p.planId, p);
        console.log(`[PlanStore] Loaded ${map.size} plan(s) from ${PLAN_FILE}`);
    } catch (e) {
        console.warn('[PlanStore] Could not parse plans.json — starting fresh:', String(e));
    }
    return map;
}

function savePlans(plans: Map<string, MerchantPlan>): void {
    try {
        if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
        writeFileSync(PLAN_FILE, JSON.stringify(Array.from(plans.values()), null, 2), 'utf-8');
    } catch (e) {
        console.error('[PlanStore] Failed to persist plans.json:', String(e));
    }
}

// ─── Store ────────────────────────────────────────────────────────────────────

const planStore = loadPlans();

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Create a new merchant subscription plan.
 */
export function createPlan(opts: CreatePlanOptions): MerchantPlan {
    const now = new Date().toISOString();
    const plan: MerchantPlan = {
        planId: randomUUID(),
        name: opts.name,
        description: opts.description ?? '',
        authorizedSats: opts.authorizedSats,
        intervalBlocks: opts.intervalBlocks ?? 144,
        perCallSats: opts.perCallSats ?? 546,
        allowedPaths: opts.allowedPaths ?? ['/api/*'],
        merchantAddress: opts.merchantAddress,
        status: 'active',
        subscriberCount: 0,
        createdAt: now,
        updatedAt: now,
    };
    planStore.set(plan.planId, plan);
    savePlans(planStore);
    return plan;
}

export function getPlan(planId: string): MerchantPlan | undefined {
    return planStore.get(planId);
}

export function getAllPlans(): MerchantPlan[] {
    return Array.from(planStore.values());
}

export function getActivePlans(): MerchantPlan[] {
    return Array.from(planStore.values()).filter(p => p.status === 'active');
}

export function updatePlan(planId: string, patch: Partial<Omit<MerchantPlan, 'planId' | 'createdAt'>>): MerchantPlan | null {
    const plan = planStore.get(planId);
    if (!plan) return null;
    const updated: MerchantPlan = { ...plan, ...patch, updatedAt: new Date().toISOString() };
    planStore.set(planId, updated);
    savePlans(planStore);
    return updated;
}

/**
 * Increment subscriber count when a new subscription is deployed under this plan.
 */
export function incrementSubscribers(planId: string): void {
    const plan = planStore.get(planId);
    if (!plan) return;
    plan.subscriberCount += 1;
    plan.updatedAt = new Date().toISOString();
    savePlans(planStore);
}

/**
 * Check whether a given API path is allowed by a plan.
 * Supports exact matches and wildcard suffix matching (e.g. '/api/*').
 */
export function isPathAllowed(plan: MerchantPlan, path: string): boolean {
    for (const pattern of plan.allowedPaths) {
        if (pattern === '*' || pattern === '/*') return true;
        if (pattern.endsWith('/*')) {
            const prefix = pattern.slice(0, -2); // remove '/*'
            if (path === prefix || path.startsWith(prefix + '/')) return true;
        }
        if (pattern === path) return true;
    }
    return false;
}

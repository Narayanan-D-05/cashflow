/**
 * src/server/middleware/requireSubscription.ts
 * Router402 subscription gate — the core of the 5-step CashFlow402 flow.
 *
 * This middleware implements Step 3 + Step 4 of the flow:
 *   Step 3: Client calls API → Router checks sub status → Grants access
 *   Step 4: Per-call: Router deducts sats from contract balance (Router402 pattern)
 *
 * How it works:
 *   1. Client presents X-Subscription-Token: <tokenCategory> header (or JWT Bearer).
 *   2. Router looks up the subscription in the store.
 *   3. Checks that the subscription is `active`.
 *   4. Checks the plan's `allowedPaths` if a planId is attached.
 *   5. Deducts `plan.perCallSats` (or default) from the tracked balance via usageMeter.
 *   6. If balance is exhausted → 402 with top-up instructions.
 *   7. Attaches deduction info to `req.subscriptionContext` for downstream handlers.
 *
 * The deducted sats accumulate in `usageMeter.pendingSats` until the merchant
 * calls `POST /subscription/claim` to sweep funds on-chain.
 */

import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../../utils/jwt.js';
import { getByCategory } from '../../services/subscriptionStore.js';
import { recordUsage } from '../../services/usageMeter.js';
import { getPlan, isPathAllowed } from '../../services/merchantPlanStore.js';
import { randomUUID } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubscriptionContext {
    tokenCategory: string;
    contractAddress: string;
    costSats: number;
    remainingBalance: bigint;
    pendingSats: bigint;
    requestId: string;
    planId?: string;
}

// Extend Express Request
declare module 'express-serve-static-core' {
    interface Request {
        subscriptionContext?: SubscriptionContext;
    }
}

// ─── Helper: extract token category ──────────────────────────────────────────

function extractTokenCategory(req: Request): string | null {
    // 1. X-Subscription-Token header (raw tokenCategory)
    const subHeader = req.headers['x-subscription-token'];
    if (typeof subHeader === 'string') return subHeader;

    // 2. Bearer JWT (subscription type)
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
        const jwt = authHeader.slice(7);
        const payload = verifyAccessToken(jwt);
        if (payload?.type === 'subscription') {
            return payload.tokenCategory;
        }
    }

    // 3. Query param for convenience
    const query = req.query['tokenCategory'];
    if (typeof query === 'string') return query;

    return null;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * requireSubscription
 *
 * Gate an Express route behind an active CashToken subscription.
 * Deducts sats per call (Router402 pattern).
 *
 * Options:
 *   planId       — if set, validates that the token belongs to this plan
 *   perCallSats  — override default per-call rate
 */
export function requireSubscription(opts: {
    planId?: string;
    perCallSats?: number;
} = {}): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction): void => {
        const requestId = randomUUID().slice(0, 8);

        // 1. Extract token category
        const tokenCategory = extractTokenCategory(req);
        if (!tokenCategory) {
            res.status(402).json({
                error: 'Payment Required',
                hint: 'Provide an active CashToken subscription via X-Subscription-Token header.',
                howToSubscribe: `POST /deploy-subscription with { subscriberAddress, planId? }`,
                requestId,
            });
            return;
        }

        // 2. Look up subscription
        const record = getByCategory(tokenCategory);
        if (!record) {
            res.status(402).json({
                error: 'Subscription not found.',
                tokenCategory,
                hint: 'The provided tokenCategory does not match any known subscription.',
                requestId,
            });
            return;
        }

        // 3. Check active status
        if (record.status !== 'active') {
            res.status(402).json({
                error: `Subscription is not active (status: ${record.status}).`,
                contractAddress: record.contractAddress,
                tokenCategory,
                hint: record.status === 'pending_funding'
                    ? 'Fund the contract via POST /subscription/auto-fund'
                    : 'Subscription has expired or been cancelled.',
                requestId,
            });
            return;
        }

        // 4. Resolve plan and per-call rate
        let perCallSats = opts.perCallSats ?? parseInt(process.env['DEFAULT_PERCALL_RATE_SATS'] ?? '546', 10);
        let planId = opts.planId;

        if (planId) {
            const plan = getPlan(planId);
            if (!plan || plan.status !== 'active') {
                res.status(402).json({
                    error: `Subscription plan '${planId}' is not available.`,
                    requestId,
                });
                return;
            }
            // Use plan's per-call rate unless caller overrides
            if (!opts.perCallSats) perCallSats = plan.perCallSats;

            // Check allowed paths
            if (!isPathAllowed(plan, req.path)) {
                res.status(403).json({
                    error: `Your subscription plan '${plan.name}' does not allow access to ${req.path}.`,
                    allowedPaths: plan.allowedPaths,
                    requestId,
                });
                return;
            }
        }

        // 5. Deduct sats (Router402 meter)
        let deductResult: { pendingSats: bigint; remainingBalance: bigint };
        try {
            deductResult = recordUsage({
                tokenCategory,
                contractAddress: record.contractAddress,
                currentBalance: record.balance,
                costSats: perCallSats,
                apiPath: req.path,
                requestId,
            });
        } catch (e) {
            // Balance exhausted — issue 402 with top-up info
            res.status(402).json({
                error: 'Subscription balance exhausted.',
                detail: String(e),
                contractAddress: record.contractAddress,
                tokenCategory,
                hint: `Deposit more BCH to ${record.contractAddress} to continue.`,
                authorizedSats: record.authorizedSats.toString(),
                requestId,
            });
            return;
        }

        // 6. Attach context for downstream handlers and response headers
        const ctx: SubscriptionContext = {
            tokenCategory,
            contractAddress: record.contractAddress,
            costSats: perCallSats,
            remainingBalance: deductResult.remainingBalance,
            pendingSats: deductResult.pendingSats,
            requestId,
            planId,
        };
        req.subscriptionContext = ctx;

        // Expose metering info in response headers
        res.set('X-Subscription-Cost-Sats', String(perCallSats));
        res.set('X-Subscription-Balance-Sats', deductResult.remainingBalance.toString());
        res.set('X-Subscription-Pending-Sats', deductResult.pendingSats.toString());
        res.set('X-Subscription-Token-Category', tokenCategory);
        res.set('X-Request-Id', requestId);

        next();
    };
}

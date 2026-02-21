/**
 * src/server/routes/merchant.ts
 * Merchant-facing routes for Step 1 of the CashFlow402 flow:
 *
 *   POST /merchant/plan       — Create a subscription plan (gets unique planId / NFT tier)
 *   GET  /merchant/plans      — List all plans
 *   GET  /merchant/plans/:planId — Get plan details
 *   PATCH /merchant/plans/:planId — Update plan (pause, change rates, etc.)
 *   GET  /merchant/dashboard  — Aggregated stats: pending sats, active subs, usage
 *   POST /merchant/claim-all  — Trigger on-chain claim for ALL claimable subscriptions
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
    createPlan,
    getPlan,
    getAllPlans,
    updatePlan,
    type CreatePlanOptions,
} from '../../services/merchantPlanStore.js';
import {
    getAllSubscriptions,
    recordClaim,
} from '../../services/subscriptionStore.js';
import {
    getAllUsage,
    getTotalPendingSats,
    resetPendingSats,
    getUsage,
} from '../../services/usageMeter.js';
import { buildAndSendClaimTx } from '../../contracts/deploy.js';


export const merchantRouter = Router();

// ─── POST /merchant/plan ──────────────────────────────────────────────────────

/**
 * Step 1: Merchant deploys a subscription plan.
 *
 * Each plan generates a unique planId. Subscribers who buy this plan
 * will each get a unique CashToken NFT category (their subscription NFT).
 *
 * Body:
 *   name           — Plan display name
 *   description    — What access this grants
 *   authorizedSats — Max sats per billing interval (e.g. 50000)
 *   intervalBlocks — BCH blocks per billing cycle (default: 144 ≈ 1 day)
 *   perCallSats    — Sats deducted per API call (Router402 rate, default: 546)
 *   allowedPaths   — API paths this plan grants (default: ['/api/*'])
 */
merchantRouter.post('/merchant/plan', (req: Request, res: Response): void => {
    const {
        name,
        description,
        authorizedSats,
        intervalBlocks,
        perCallSats,
        allowedPaths,
    } = req.body as Partial<CreatePlanOptions>;

    if (!name || !authorizedSats) {
        res.status(400).json({ error: 'name and authorizedSats are required.' });
        return;
    }

    // Use MERCHANT_ADDRESS env var directly — WIF is only needed for signing
    // on-chain claim transactions, not for plan configuration.
    const merchantAddress = process.env['MERCHANT_ADDRESS'];
    if (!merchantAddress) {
        res.status(500).json({ error: 'MERCHANT_ADDRESS not configured on this server.' });
        return;
    }

    const plan = createPlan({
        name,
        description,
        authorizedSats,
        intervalBlocks,
        perCallSats,
        allowedPaths,
        merchantAddress,
    });

    res.status(201).json({
        message: `Plan '${plan.name}' created. Subscribers can now deploy subscriptions referencing planId.`,
        plan,
        nextStep: `Subscribers call POST /deploy-subscription with { subscriberAddress, planId: '${plan.planId}' }`,
    });
});

// ─── GET /merchant/plans ──────────────────────────────────────────────────────

merchantRouter.get('/merchant/plans', (_req: Request, res: Response): void => {
    const plans = getAllPlans();
    res.status(200).json({ plans, count: plans.length });
});

// ─── GET /merchant/plans/:planId ──────────────────────────────────────────────

merchantRouter.get('/merchant/plans/:planId', (req: Request, res: Response): void => {
    const plan = getPlan(req.params['planId'] as string);
    if (!plan) {
        res.status(404).json({ error: 'Plan not found.' });
        return;
    }
    res.status(200).json({ plan });
});

// ─── PATCH /merchant/plans/:planId ────────────────────────────────────────────

merchantRouter.patch('/merchant/plans/:planId', (req: Request, res: Response): void => {
    const planId = req.params['planId'] as string;
    const { name, description, perCallSats, allowedPaths, status } = req.body as {
        name?: string;
        description?: string;
        perCallSats?: number;
        allowedPaths?: string[];
        status?: 'active' | 'paused' | 'archived';
    };

    const updated = updatePlan(planId, { name, description, perCallSats, allowedPaths, status });
    if (!updated) {
        res.status(404).json({ error: 'Plan not found.' });
        return;
    }
    res.status(200).json({ message: 'Plan updated.', plan: updated });
});

// ─── GET /merchant/dashboard ──────────────────────────────────────────────────

/**
 * Merchant dashboard: aggregated view of subscriptions, usage, and pending earnings.
 */
merchantRouter.get('/merchant/dashboard', (_req: Request, res: Response): void => {
    const plans = getAllPlans();
    const subscriptions = getAllSubscriptions();
    const usageRecords = getAllUsage();

    const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
    const pendingSubscriptions = subscriptions.filter(s => s.status === 'pending_funding');

    const totalBalance = subscriptions.reduce((sum, s) => sum + s.balance, 0n);
    const totalPending = getTotalPendingSats();

    // Per-subscription usage summary
    const usageSummary = usageRecords.map(u => ({
        tokenCategory: u.tokenCategory.slice(0, 12) + '…',
        contractAddress: u.contractAddress.slice(0, 20) + '…',
        pendingSats: u.pendingSats.toString(),
        totalSats: u.totalSats.toString(),
        recentCallCount: u.recentCalls.length,
        lastUsedAt: u.lastUsedAt,
    }));

    // Which subscriptions are claimable right now (on-chain interval elapsed logic is async;
    // we just flag them as "check their status")
    const claimableCount = activeSubscriptions.length;

    res.status(200).json({
        summary: {
            totalPlans: plans.length,
            activePlans: plans.filter(p => p.status === 'active').length,
            activeSubscriptions: activeSubscriptions.length,
            pendingSubscriptions: pendingSubscriptions.length,
            totalContractBalance: totalBalance.toString(),
            totalPendingEarnings: totalPending.toString(),
            claimableSubscriptions: claimableCount,
        },
        plans: plans.map(p => ({
            planId: p.planId,
            name: p.name,
            perCallSats: p.perCallSats,
            authorizedSats: p.authorizedSats,
            intervalBlocks: p.intervalBlocks,
            subscriberCount: p.subscriberCount,
            status: p.status,
        })),
        subscriptions: subscriptions.map(s => ({
            contractAddress: s.contractAddress.slice(0, 20) + '…',
            tokenCategory: s.tokenCategory.slice(0, 12) + '…',
            status: s.status,
            balance: s.balance.toString(),
            authorizedSats: s.authorizedSats.toString(),
            pendingUsage: (getUsage(s.tokenCategory)?.pendingSats ?? 0n).toString(),
            lastClaimBlock: s.lastClaimBlock,
            intervalBlocks: s.intervalBlocks,
        })),
        usage: usageSummary,
    });
});

// ─── POST /merchant/claim-all ─────────────────────────────────────────────────

/**
 * Step 5: Merchant claims accumulated payments from all claimable subscriptions.
 *
 * Attempts an on-chain claim for every active subscription.
 * Subscriptions where the interval hasn't elapsed are skipped gracefully.
 */
merchantRouter.post('/merchant/claim-all', async (_req: Request, res: Response): Promise<void> => {
    const subscriptions = getAllSubscriptions();
    const active = subscriptions.filter(s => s.status === 'active');

    if (active.length === 0) {
        res.status(200).json({ message: 'No active subscriptions to claim from.', results: [] });
        return;
    }

    const results: Array<{
        contractAddress: string;
        tokenCategory: string;
        status: 'claimed' | 'skipped' | 'error';
        txid?: string;
        claimedSats?: string;
        error?: string;
    }> = [];

    for (const record of active) {
        try {
            // Metered billing: only claim what users actually consumed
            const usage = getUsage(record.tokenCategory);
            const pendingSats = usage?.pendingSats ?? 0n;

            if (pendingSats <= 0n) {
                results.push({
                    contractAddress: record.contractAddress,
                    tokenCategory: record.tokenCategory,
                    status: 'skipped',
                    error: 'No pending usage to claim.',
                });
                continue;
            }

            const result = await buildAndSendClaimTx(record, pendingSats);

            // Update local store
            recordClaim(record.contractAddress, result.newLastClaimBlock, result.newBalance);

            // Reset usage meter pending sats
            resetPendingSats(record.tokenCategory, result.claimedSats);

            results.push({
                contractAddress: record.contractAddress,
                tokenCategory: record.tokenCategory,
                status: 'claimed',
                txid: result.txid,
                claimedSats: result.claimedSats.toString(),
            });
        } catch (e) {
            const errMsg = String(e);
            // "Interval not yet elapsed" is expected — not an error
            const skipped = errMsg.includes('Interval not yet elapsed');
            results.push({
                contractAddress: record.contractAddress,
                tokenCategory: record.tokenCategory,
                status: skipped ? 'skipped' : 'error',
                error: errMsg,

            });
        }
    }

    const claimed = results.filter(r => r.status === 'claimed');
    const totalClaimed = claimed.reduce((sum, r) => sum + BigInt(r.claimedSats ?? 0), 0n);

    res.status(200).json({
        message: `Claim-all complete. ${claimed.length}/${active.length} subscriptions claimed.`,
        totalClaimedSats: totalClaimed.toString(),
        results,
    });
});

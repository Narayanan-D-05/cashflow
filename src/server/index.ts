/**
 * src/server/index.ts
 * CashFlow402 Express server entry point.
 *
 * Mounts all routes, applies middleware, and connects to the Electrum node
 * before accepting requests.
 *
 * Start with: npm run dev
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { paymentRouter } from './routes/payment.js';
import { subscriptionRouter } from './routes/subscription.js';
import { webhookRouter } from './routes/webhook.js';
import { merchantRouter } from './routes/merchant.js';
import { require402 } from './middleware/require402.js';
import { requireSubscription } from './middleware/requireSubscription.js';
import { connectElectrum } from '../services/electrumService.js';
import { openApiSpec } from './openapi.js';
import { getByAddress, recordClaim } from '../services/subscriptionStore.js';
import { buildAndSendClaimTx } from '../contracts/deploy.js';
import { resetPendingSats } from '../services/usageMeter.js';

const app = express();
const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

// ─── Global Middleware ────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger (minimal, no dependencies)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check — no auth
app.get('/', (_req, res) => {
  res.redirect('/docs');
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'CashFlow402', version: '1.0.0', timestamp: new Date().toISOString() });
});

// OpenAPI spec (machine-readable)
app.get('/openapi.json', (_req, res) => {
  res.json(openApiSpec);
});

// Swagger UI (human-readable docs at /docs)
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec as Parameters<typeof swaggerUi.setup>[0], {
  customSiteTitle: 'CashFlow402 API Docs',
  swaggerOptions: { persistAuthorization: true },
}));

// Payment verification (per-call flow)
app.use('/', paymentRouter);

// Subscription lifecycle
app.use('/', subscriptionRouter);

// Merchant plan management (Step 1 + Step 5)
app.use('/', merchantRouter);

// Webhooks
app.use('/', webhookRouter);

// ─── Demo protected API (shows the full 402 flow end-to-end) ─────────────────

/**
 * GET /api/premium/hello
 * A token-gated demo endpoint (per-call / one-time pay model).
 * Hitting it without a valid payment token returns 402 with a payment challenge.
 */
app.get('/api/premium/hello', require402, (req, res) => {
  res.json({
    message: 'You have paid for this API call via BCH!',
    data: {
      greeting: 'Welcome to CashFlow402 — BCH-powered API monetization.',
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * GET /api/premium/data
 * Another demo protected endpoint (per-call).
 */
app.get('/api/premium/data', require402, (req, res) => {
  res.json({
    message: 'Paid API data endpoint',
    data: {
      price: { BCH: 1, USD: 380 },
      block: 'latest',
      network: process.env['BCH_NETWORK'] ?? 'chipnet',
    },
  });
});

// ─── Subscription (Router402) Protected API ─────────────────────────────────
// Steps 3 + 4: Client calls API → Router checks sub status → Deducts sats per call

/**
 * GET /api/subscription/data
 *
 * Subscription-gated endpoint using the Router402 pattern.
 * Requires X-Subscription-Token: <tokenCategory> header (or Bearer JWT).
 * Per call, the router deducts `DEFAULT_PERCALL_RATE_SATS` from the subscriber's
 * tracked balance.  Accumulated sats are claimed by the merchant via
 * POST /subscription/claim or POST /merchant/claim-all.
 */
app.get('/api/subscription/data', requireSubscription(), async (req, res) => {
  const ctx = req.subscriptionContext!;
  let claimTxid: string | undefined;

  // --- AUTOMATIC JUST-IN-TIME (JIT) CLAIMING ---
  // If the user's pending unpaid usage exceeds our threshold (e.g. 4000 sats, which is half of 8000 deposit),
  // automatically trigger an on-chain claim for this specific subscription before responding.
  if (ctx.pendingSats >= 4000n) {
    const record = getByAddress(ctx.contractAddress);
    if (record) {
      console.log(`[JIT Claim] Threshold crossed (${ctx.pendingSats} sats). Triggering auto-claim for ${ctx.contractAddress}...`);
      try {
        const result = await buildAndSendClaimTx(record, ctx.pendingSats);
        recordClaim(record.contractAddress, result.newLastClaimBlock, result.newBalance);
        resetPendingSats(record.tokenCategory, result.claimedSats);
        claimTxid = result.txid;
        console.log(`[JIT Claim] ✅ Success: ${result.claimedSats} sats claimed in tx ${claimTxid}`);
      } catch (err) {
        console.error(`[JIT Claim] ❌ Failed to auto-claim:`, err);
      }
    }
  }

  res.json({
    message: '✅ Subscription-gated API call succeeded (Router402 deduction applied).',
    flow: {
      step3: 'Router checked subscription status → active',
      step4: `Router deducted ${ctx.costSats} sats from contract balance`,
    },
    context: {
      requestId: ctx.requestId,
      tokenCategory: ctx.tokenCategory.slice(0, 12) + '…',
      contractAddress: ctx.contractAddress.slice(0, 20) + '…',
      costSats: ctx.costSats,
      remainingBalance: ctx.remainingBalance.toString(),
      pendingSats: ctx.pendingSats.toString(),
      claimTxid, // Pass it back to the client!
    },
    data: {
      price: { BCH: 1, USD: 380 },
      block: 'latest',
      network: process.env['BCH_NETWORK'] ?? 'chipnet',
      hint: 'Call POST /subscription/claim or POST /merchant/claim-all to settle pending sats on-chain.',
    },
  });
});

/**
 * GET /api/subscription/status
 *
 * Subscription-gated status endpoint — shows remaining balance info.
 * Uses the same Router402 deduction as /api/subscription/data.
 */
app.get('/api/subscription/status', requireSubscription(), (req, res) => {
  const ctx = req.subscriptionContext!;
  res.json({
    message: 'Subscription status check (Router402 deduction applied).',
    context: {
      requestId: ctx.requestId,
      tokenCategory: ctx.tokenCategory.slice(0, 12) + '…',
      contractAddress: ctx.contractAddress.slice(0, 20) + '…',
      costSats: ctx.costSats,
      remainingBalance: ctx.remainingBalance.toString(),
      pendingSats: ctx.pendingSats.toString(),
    },
  });
});

/**
 * GET /api/subscription/premium
 *
 * Higher-cost subscription endpoint (3× the default rate).
 * Demonstrates per-endpoint pricing via the Router402 pattern.
 */
app.get('/api/subscription/premium', requireSubscription({ perCallSats: 1638 }), (req, res) => {
  const ctx = req.subscriptionContext!;
  res.json({
    message: '🌟 Premium subscription endpoint — higher Router402 deduction rate.',
    context: {
      requestId: ctx.requestId,
      costSats: ctx.costSats,
      remainingBalance: ctx.remainingBalance.toString(),
      pendingSats: ctx.pendingSats.toString(),
    },
    premiumData: {
      analytics: { calls: 42, successRate: '99.8%' },
      latency: '12ms',
      region: 'chipnet',
    },
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err);
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  res.status(500).json({ error: message });
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function start() {
  console.log('[CashFlow402] Connecting to Electrum node…');
  try {
    await connectElectrum();
    console.log('[CashFlow402] Electrum connected.');
  } catch (e) {
    console.warn('[CashFlow402] Warning: could not connect to Electrum at startup:', String(e));
    console.warn('[CashFlow402] Payment verification will fail until Electrum is reachable.');
  }

  app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  CashFlow402 Backend  •  v1.0  (5-Step Flow Active)          ║`);
    console.log(`║  Network: ${(process.env['BCH_NETWORK'] ?? 'chipnet').padEnd(51)}║`);
    console.log(`║  Server:  http://localhost:${PORT}${' '.repeat(34)}║`);
    console.log(`║  Docs:    http://localhost:${PORT}/docs${' '.repeat(28)}║`);
    console.log(`╠══════════════════════════════════════════════════════════════╣`);
    console.log(`║  ── Step 1: Merchant Deploy Plan ──────────────────────────  ║`);
    console.log(`║  POST /merchant/plan              — create subscription plan  ║`);
    console.log(`║  GET  /merchant/plans             — list all plans           ║`);
    console.log(`║  GET  /merchant/dashboard         — earnings dashboard        ║`);
    console.log(`║  ── Step 2: Client Buys Sub ───────────────────────────────  ║`);
    console.log(`║  POST /deploy-subscription        — deploy covenant + NFT     ║`);
    console.log(`║  POST /subscription/create-session — generate keypair        ║`);
    console.log(`║  POST /subscription/auto-fund      — fund + activate sub      ║`);
    console.log(`║  ── Step 3 + 4: Router402 API Access ──────────────────────  ║`);
    console.log(`║  GET  /api/subscription/data      — sub-gated (deducts sats) ║`);
    console.log(`║  GET  /api/subscription/status    — sub-gated status check   ║`);
    console.log(`║  GET  /api/subscription/premium   — higher-rate endpoint      ║`);
    console.log(`║  GET  /subscription/verify        — issue subscription JWT   ║`);
    console.log(`║  ── Step 5: Merchant Claims ───────────────────────────────  ║`);
    console.log(`║  POST /subscription/claim         — single claim             ║`);
    console.log(`║  POST /merchant/claim-all         — batch claim all subs      ║`);
    console.log(`║  ── Per-Call (HTTP-402) ───────────────────────────────────  ║`);
    console.log(`║  GET  /payment/challenge          — get a 402 challenge       ║`);
    console.log(`║  POST /verify-payment             — verify BCH payment        ║`);
    console.log(`║  GET  /api/premium/hello          — demo per-call endpoint    ║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
  });
}

// Only start the server when this file is the direct entry point.
// Jest sets JEST_WORKER_ID in all test workers — skip startup during tests
// so app.listen() never fires and Jest exits cleanly.
if (!process.env['JEST_WORKER_ID']) {
  start().catch(err => {
    console.error('[CashFlow402] Fatal startup error:', err);
    process.exit(1);
  });
}

export { app };

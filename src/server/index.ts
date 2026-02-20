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
import { paymentRouter }      from './routes/payment.js';
import { subscriptionRouter } from './routes/subscription.js';
import { webhookRouter }      from './routes/webhook.js';
import { require402 }         from './middleware/require402.js';
import { connectElectrum }    from '../services/electrumService.js';
import { openApiSpec }        from './openapi.js';

const app  = express();
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

// Webhooks
app.use('/', webhookRouter);

// ─── Demo protected API (shows the full 402 flow end-to-end) ─────────────────

/**
 * GET /api/premium/hello
 * A token-gated demo endpoint.  Hitting it without a valid payment token
 * returns a 402 with a payment challenge.
 */
app.get('/api/premium/hello', require402, (req, res) => {
  res.json({
    message: 'You have paid for this API call via BCH!',
    data: {
      greeting:  'Welcome to CashFlow402 — BCH-powered API monetization.',
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * GET /api/premium/data
 * Another demo protected endpoint.
 */
app.get('/api/premium/data', require402, (req, res) => {
  res.json({
    message: 'Paid API data endpoint',
    data: {
      price:   { BCH: 1, USD: 380 },
      block:   'latest',
      network: process.env['BCH_NETWORK'] ?? 'chipnet',
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
    console.log(`\n╔══════════════════════════════════════════════════════╗`);
    console.log(`║  CashFlow402 Backend  •  v1.0                        ║`);
    console.log(`║  Network: ${(process.env['BCH_NETWORK'] ?? 'chipnet').padEnd(42)}║`);
    console.log(`║  Server:  http://localhost:${PORT}${' '.repeat(25)}║`);
    console.log(`║  Docs:    http://localhost:${PORT}/docs${' '.repeat(21)}║`);
    console.log(`╠══════════════════════════════════════════════════════╣`);
    console.log(`║  GET  /health                 — liveness check       ║`);
    console.log(`║  GET  /docs                   — Swagger UI           ║`);
    console.log(`║  GET  /openapi.json           — raw spec             ║`);
    console.log(`║  GET  /payment/challenge      — get a 402 challenge  ║`);
    console.log(`║  POST /verify-payment         — verify BCH payment   ║`);
    console.log(`║  POST /deploy-subscription    — create subscription  ║`);
    console.log(`║  POST /subscription/claim     — merchant claim       ║`);
    console.log(`║  GET  /subscription/status/:addr                     ║`);
    console.log(`║  GET  /api/premium/hello      — demo 402 endpoint    ║`);
    console.log(`╚══════════════════════════════════════════════════════╝\n`);
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

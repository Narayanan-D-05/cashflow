# CashFlow402

**BCH-native HTTP-402 micropayment and CashToken subscription protocol.**

Pay-per-call access control and recurring subscriptions backed by Bitcoin Cash smart contracts. No custodians. No intermediaries. The covenant enforces payment rules directly on-chain.

> 📦 **npm package:** [`cashflow402-bch`](https://www.npmjs.com/package/cashflow402-bch)
> 🐙 **GitHub:** [Narayanan-D-05/cashflow](https://github.com/Narayanan-D-05/cashflow)
> 🌐 **Network:** ChipNet (BCH Testnet)
> 👤 **Author:** Narayanan D — `narayanan.27csb@licet.ac.in`

---

## Table of Contents

1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [System Architecture](#system-architecture)
4. [Full End-to-End Flow](#full-end-to-end-flow)
5. [Running Locally](#running-locally)
6. [Environment Variables](#environment-variables)
7. [API Reference](#api-reference)
8. [Merchant Dashboard](#merchant-dashboard)
9. [SDK Usage](#sdk-usage)
10. [CashScript Contract](#cashscript-contract)
11. [On-Chain Proof](#on-chain-proof)
12. [Scripts](#scripts)
13. [Testing](#testing)
14. [Known Limitations (Current State)](#known-limitations-current-state)
15. [Publishing](#publishing)

---

## Overview

CashFlow402 implements two complementary payment models:

| Flow | Use case | How it works |
|---|---|---|
| **Per-call (HTTP-402)** | Charge per API request | Client hits endpoint → gets 402 → pays BCH → submits txid → gets short-lived JWT → retries |
| **Subscription (Router402)** | Recurring access | Subscriber locks BCH + mutable NFT in a CashScript covenant → merchant pulls one interval's payment every N blocks |

Both flows use **real on-chain BCH transactions** verified against the ChipNet Electrum network — nothing is mocked.

---

## Project Structure

The project is a monorepo with three top-level packages:

```
bch/
├── cashflow/                      ← This repo — SDK + Backend + Cashflow UI
│   ├── src/
│   │   ├── sdk/index.ts           ← CashFlow402Client (published to npm)
│   │   ├── server/                ← Express 5 API server
│   │   │   ├── index.ts           ← Entry point (port 3000)
│   │   │   ├── routes/
│   │   │   │   ├── subscription.ts
│   │   │   │   ├── merchant.ts
│   │   │   │   ├── payment.ts
│   │   │   │   └── webhook.ts
│   │   │   └── middleware/
│   │   │       ├── require402.ts          ← Per-call gate
│   │   │       └── requireSubscription.ts ← Router402 subscription gate
│   │   ├── services/
│   │   │   ├── electrumService.ts  ← ChipNet WSS connection
│   │   │   ├── subscriptionStore.ts ← JSON-backed persistent store
│   │   │   ├── merchantPlanStore.ts ← Plan management
│   │   │   ├── txVerifier.ts       ← On-chain UTXO verification
│   │   │   └── usageMeter.ts       ← Per-call sat deduction tracker
│   │   ├── contracts/
│   │   │   ├── AutoPaySubscription.json  ← Compiled CashScript artifact
│   │   │   └── deploy.ts                 ← Contract factory + claim/cancel builders
│   │   └── utils/
│   │       ├── crypto.ts    ← libauth key/address/NFT helpers
│   │       ├── jwt.ts       ← JWT sign/verify
│   │       ├── bip21.ts     ← BIP-21 URI builder
│   │       └── buildFundingTx.ts ← Genesis NFT tx builder
│   ├── frontend/                   ← Cashflow subscription UI (Next.js, port 3001)
│   │   └── app/
│   │       ├── subscription/page.tsx  ← 3-step subscription flow UI
│   │       └── merchant/page.tsx      ← Merchant Dashboard (claim funds)
│   ├── contracts/
│   │   └── AutoPaySubscription.cash   ← CashScript source
│   ├── data/                       ← Persistent JSON stores (auto-created)
│   │   ├── subscriptions.json
│   │   ├── plans.json
│   │   └── usage.json
│   └── dist/                       ← Compiled TypeScript output (npm published)
│
└── merchant/
    └── frontend/                   ← Merchant demo app (Next.js, port 3005)
        └── app/
            ├── page.tsx            ← Subscribe CTA + AI Chat interface
            ├── agent/page.tsx      ← Dedicated AI Agent chat page
            └── api/cashflow/route.ts ← Server-side SDK bridge
```

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                      Merchant Demo App                               │
│                   http://localhost:3005                               │
│                                                                      │
│  page.tsx ──────── If no token ──► Subscribe CTA                    │
│                │                       │                             │
│                │                  Redirects to Cashflow UI           │
│                │                       │                             │
│                └── If token ────► AI Agent Chat                      │
│                    Each message sends X-Subscription-Token           │
│                    to GET /api/subscription/data                     │
│                    → deducts sats per call (Router402)               │
└─────────────────────────┬────────────────────────────────────────────┘
                          │ HTTP
                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   CashFlow402 Backend                                │
│                   http://localhost:3000                               │
│                                                                      │
│  Express 5 + TypeScript                                              │
│  ├── POST /subscription/create-session  ← Step 1: Deploy contract   │
│  ├── POST /subscription/auto-fund       ← Step 3: Fund & activate   │
│  ├── GET  /api/subscription/data        ← Router402 gated endpoint  │
│  ├── POST /subscription/claim           ← Merchant single claim     │
│  ├── POST /merchant/claim-all           ← Merchant batch claim      │
│  └── GET  /merchant/dashboard           ← Aggregated earnings view  │
│                                                                      │
│  Services:                                                           │
│  ├── electrumService  ─── WSS ──► chipnet.imaginary.cash:50004      │
│  ├── subscriptionStore ── JSON ─► data/subscriptions.json           │
│  ├── usageMeter       ── JSON ─► data/usage.json                    │
│  └── CashScript covenant ──────► AutoPaySubscription.cash           │
└─────────────────────────┬────────────────────────────────────────────┘
                          │ WSS
                          ▼
                 ChipNet Electrum Node
              chipnet.imaginary.cash:50004
                          │
                          ▼
                 Bitcoin Cash (ChipNet)
              ┌─────────────────────────┐
              │  AutoPaySubscription    │
              │  CashScript Covenant    │
              │  ────────────────────  │
              │  • locks BCH + NFT      │
              │  • enforces intervals   │
              │  • merchant can claim   │
              │  • subscriber can cancel│
              └─────────────────────────┘
```

---

## Full End-to-End Flow

### Step 1 — Merchant Setup (one-time)
The merchant deploys a subscription plan on the backend:
```bash
POST /merchant/plan
{
  "name": "AI Agent Access",
  "authorizedSats": 50000,
  "intervalBlocks": 144,
  "perCallSats": 546
}
```

### Step 2 — User Visits Merchant App
User lands on `http://localhost:3005`. They see a "Subscribe via Cashflow" button with no existing token.

### Step 3 — Subscription Creation (Cashflow UI)
User is redirected to `http://localhost:3001/subscription?callbackUrl=http://localhost:3005/`.

The Cashflow subscription UI runs a **3-step flow**:

```
Step 1: POST /subscription/create-session
  → Backend generates fresh subscriber keypair
  → Deploys AutoPaySubscription covenant (deterministic, no broadcast)
  → Returns: subscriberAddress, subscriberWif, contractAddress, depositSats

Step 2: Fund the subscriber address
  → User sends tBCH to subscriberAddress from:
    - Paytaca wallet (0-conf supported), OR
    - tbch.googol.cash faucet

Step 3: POST /subscription/auto-fund
  → Server uses subscriberWif to build genesis funding transaction
  → Creates mutable NFT with commitment: [lastClaimBlock LE32][authorizedSats LE32]
  → Broadcasts to ChipNet via Electrum
  → Subscription status → "active"
  → Returns: txid, tokenCategory (the NFT category = subscription ID)
  → UI shows "Continue to Merchant App" button with tokenCategory in URL
```

### Step 4 — Merchant App Access (Router402)
User is redirected back to `http://localhost:3005/?tokenCategory=<hex>`.

The merchant app saves the `tokenCategory` to `localStorage`. Every AI agent message sends:

```
GET http://localhost:3000/api/subscription/data
X-Subscription-Token: <tokenCategory>
```

The `requireSubscription()` middleware:
1. Looks up subscription by tokenCategory
2. Verifies status is `active`
3. Deducts `perCallSats` from tracked balance via `usageMeter`
4. Returns context: `costSats`, `remainingBalance`, `pendingSats`

### Step 5 — Merchant Claims Funds
Accumulated sats are claimed on-chain via the Merchant Dashboard at `http://localhost:3001/merchant`:

```bash
# Single subscription claim
POST /subscription/claim
{ "contractAddress": "bchtest:pr...", "tokenCategory": "deadbeef..." }

# Batch claim all active subscriptions
POST /merchant/claim-all
→ Loops all active subs → builds CashScript claim tx for each → broadcasts
→ Returns: [{ contractAddress, tokenCategory, status: "claimed", txid, claimedSats }]
```

Each claim is a **real on-chain BCH transaction** from the covenant to the merchant wallet. Verifiable on ChipNet explorer.

---

## Running Locally

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- A ChipNet wallet funded from [tbch.googol.cash](https://tbch.googol.cash)

### 1. Clone and Install

```bash
git clone https://github.com/Narayanan-D-05/cashflow.git
cd cashflow
npm install
```

### 2. Configure Backend

```bash
cp .env.example .env
```

Edit `.env` — minimum required:

```env
MERCHANT_WIF=<your-chipnet-WIF>
MERCHANT_ADDRESS=<your-chipnet-address>
JWT_SECRET=<any-random-string>
```

Generate a fresh ChipNet keypair:
```bash
node -e "
import('@bitauth/libauth').then(lib => {
  const priv = lib.generatePrivateKey(() => require('node:crypto').getRandomValues(new Uint8Array(32)));
  console.log('WIF :', lib.encodePrivateKeyWif(priv, 'testnet'));
  const pub = lib.secp256k1.derivePublicKeyCompressed(priv);
  const pkh = lib.hash160(pub);
  console.log('Addr:', lib.encodeCashAddress('bchtest', 'p2pkh', pkh));
})"
```

Fund `MERCHANT_ADDRESS` from [tbch.googol.cash](https://tbch.googol.cash).

### 3. Start All Services

**Terminal 1 — CashFlow402 Backend (port 3000):**
```bash
cd cashflow
npm run dev
```

**Terminal 2 — Cashflow Frontend UI (port 3001):**
```bash
cd cashflow/frontend
npm install
npm run dev -- -p 3001
```

**Terminal 3 — Merchant Demo App (port 3005):**
```bash
cd merchant/frontend
npm install
npm run dev -- -p 3005
```

### 4. Open in Browser

| Service | URL | Purpose |
|---|---|---|
| **Merchant App** | http://localhost:3005 | User-facing app with subscription CTA + AI chat |
| **Cashflow UI** | http://localhost:3001/subscription | 3-step subscription flow |
| **Merchant Dashboard** | http://localhost:3001/merchant | Claim accumulated earnings |
| **API Docs (Swagger)** | http://localhost:3000/docs | Interactive API documentation |
| **Health Check** | http://localhost:3000/health | Backend status |

---

## Environment Variables

### Backend (`cashflow/.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Runtime environment |
| `JWT_SECRET` | *(required)* | Secret for signing JWTs |
| `JWT_EXPIRY_PERCALL` | `60` | Per-call token lifetime (seconds) |
| `JWT_EXPIRY_SUBSCRIPTION` | `3600` | Subscription token lifetime (seconds) |
| `BCH_NETWORK` | `chipnet` | `chipnet` or `mainnet` |
| `ELECTRUM_HOST` | `chipnet.imaginary.cash` | Electrum server hostname |
| `ELECTRUM_PORT` | `50004` | Electrum server port |
| `ELECTRUM_PROTOCOL` | `wss` | `wss` or `ssl` |
| `MERCHANT_WIF` | *(required)* | Merchant WIF private key |
| `MERCHANT_ADDRESS` | *(required)* | Merchant BCH address (receives claims) |
| `DEFAULT_PERCALL_RATE_SATS` | `546` | Sats deducted per API call |
| `DEFAULT_INTERVAL_BLOCKS` | `1` | Blocks between claimable intervals (1 = ~10 min on ChipNet) |
| `DEFAULT_AUTHORIZED_SATS` | `2000` | Max sats merchant can claim per interval |
| `WEBHOOK_SECRET` | `''` | Shared secret for webhook endpoints |

### Merchant App (`merchant/frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `CASHFLOW_SERVER_URL` | `http://localhost:3000` | CashFlow402 backend URL |
| `SUBSCRIBER_WIF` | *(optional)* | WIF for SDK-driven subscription creation |

---

## API Reference

Full interactive docs at **`GET /docs`** (Swagger UI).

### Subscription Flow

#### `POST /subscription/create-session`
Generate a fresh subscriber keypair and deploy covenant. Returns subscriber address to fund.

```json
// Response 201
{
  "subscriberAddress": "bchtest:qp...",
  "subscriberWif": "cQ...",
  "contractAddress": "bchtest:pr...",
  "tokenAddress": "bchtest:zr...",
  "genesisCommitment": "800d00002050c300",
  "depositSats": 8000,
  "authorizedSats": 2000,
  "intervalBlocks": 1,
  "startBlock": 293920,
  "hint": "Fund bchtest:qp... with at least 9500 sats from https://tbch.googol.cash"
}
```

#### `POST /subscription/auto-fund`
Server builds and broadcasts the genesis NFT funding transaction using the subscriber WIF.

```json
// Request
{ "contractAddress": "bchtest:pr...", "subscriberWif": "cQ..." }

// Response 200
{
  "message": "Subscription funded and activated.",
  "txid": "deadbeef...",
  "tokenCategory": "deadbeef...",
  "contractAddress": "bchtest:pr...",
  "depositSats": "8000",
  "authorizedSats": "2000",
  "intervalBlocks": 1
}
```

#### `GET /api/subscription/data`
Router402 gated endpoint. Deducts sats per call.

```
Headers: X-Subscription-Token: <tokenCategory>

Response Headers:
  X-Subscription-Cost-Sats: 546
  X-Subscription-Balance-Sats: 7454
  X-Subscription-Pending-Sats: 546
```

#### `POST /subscription/claim`
Merchant claims one interval from a single subscription.

```json
// Request
{ "contractAddress": "bchtest:pr...", "tokenCategory": "deadbeef..." }

// Response 200
{ "txid": "c0ffee...", "claimedSats": 2000, "nextClaimAfterBlock": 293922 }
```

#### `POST /merchant/claim-all`
Batch claim from all active subscriptions.

```json
// Response 200
{
  "message": "Claim-all complete. 1/1 subscriptions claimed.",
  "totalClaimedSats": "2000",
  "results": [
    {
      "contractAddress": "bchtest:pr...",
      "tokenCategory": "deadbeef...",
      "status": "claimed",
      "txid": "c0ffee...",
      "claimedSats": "2000"
    }
  ]
}
```

#### `GET /merchant/dashboard`
Aggregated view of all subscriptions, usage, and pending earnings.

#### `GET /subscription/list`
List all subscriptions (active + pending).

#### `GET /subscription/status/:contractAddress`
Get on-chain and in-memory status, balance, and next claim block.

#### `GET /subscription/verify`
Issue a subscription JWT.
```
Headers: X-Subscription-Token: <tokenCategory>
```

#### `POST /subscription/cancel`
```json
{ "contractAddress": "bchtest:pr...", "subscriberWif": "cQ..." }
```

---

## Merchant Dashboard

The Merchant Dashboard at `http://localhost:3001/merchant` allows:

### Single Claim
Claim from one specific subscription by providing:
- **Contract Address** — the P2SH address of the covenant
- **Token Category** — the hex NFT category (= the funding txid)

### Batch Claim All
One click sweeps all pending earnings from all active subscriptions. The server:
1. Queries all contracts with `status: "active"`
2. Attempts a CashScript claim transaction for each
3. Skips contracts where `intervalBlocks` haven't elapsed yet
4. Returns a detailed result array with txids and claimed sats

### Viewing Your Merchant Address
Your merchant address is configured in `MERCHANT_ADDRESS`. Every claim sends BCH directly to this address on-chain.

**View incoming claim transactions:**
```
https://chipnet.imaginary.cash/address/<MERCHANT_ADDRESS>
```

---

## SDK Usage

The SDK is published to npm as [`cashflow402-bch`](https://www.npmjs.com/package/cashflow402-bch).

### Install

```bash
npm install cashflow402-bch
```

Or install directly from GitHub (auto-builds via `prepare` script):
```bash
npm install github:Narayanan-D-05/cashflow
```

### Per-Call Usage (Server-Side Node.js)

```typescript
import { CashFlow402Client } from 'cashflow402-bch';

const client = new CashFlow402Client({
  walletWif: 'cQ...',           // subscriber private key
  network:   'chipnet',
  serverUrl: 'http://localhost:3000',
});

// Auto-pays any 402 challenge and retries
const data = await client.fetch('http://localhost:3000/api/premium/hello');
console.log(data);
```

### Subscription Usage

```typescript
// Create + fund a subscription in one call
const sub = await client.createSubscription({
  depositSats:    8000,
  intervalBlocks: 1,
  autoFund:       true,   // builds + broadcasts genesis NFT tx automatically
});

console.log(sub.tokenCategory);  // use this as X-Subscription-Token

// Get access JWT
const { accessToken } = await client.getSubscriptionToken(sub.tokenCategory);

// Call subscription-gated API
const res = await client.fetch('http://localhost:3000/api/subscription/data', {
  headers: { 'X-Subscription-Token': sub.tokenCategory },
});
```

### Merchant App API Bridge

The merchant Next.js app exposes a server-side SDK bridge at `POST /api/cashflow`:

```javascript
// Create subscription
await fetch('/api/cashflow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'createSubscription', depositSats: 8000 })
});

// Call protected endpoint
await fetch('/api/cashflow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'callProtectedApi', tokenCategory: '<hex>' })
});

// Get JWT
await fetch('/api/cashflow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'getSubscriptionToken', tokenCategory: '<hex>' })
});
```

---

## CashScript Contract

**Source:** `contracts/AutoPaySubscription.cash`
**Compiled:** `src/contracts/AutoPaySubscription.json`

```solidity
pragma cashscript ^0.12.0;

contract AutoPaySubscription(
    bytes20 merchantPkh,
    bytes20 subscriberPkh,
    int     intervalBlocks
) {
    // Merchant pulls authorizedSats after intervalBlocks have elapsed
    function claim(pubkey merchantPk, sig merchantSig) { ... }

    // Subscriber sweeps remaining balance and destroys NFT
    function cancel(pubkey subscriberPk, sig subscriberSig) { ... }
}
```

The subscription state is stored in a **mutable NFT commitment** (8 bytes):

```
Bytes 0-3: lastClaimBlock  (int32 little-endian)
Bytes 4-7: authorizedSats  (int32 little-endian)
```

On every `claim()`:
- Covenant checks `tx.locktime ≥ lastClaimBlock + intervalBlocks`
- Checks claim amount `≤ authorizedSats`
- Updates commitment with new `lastClaimBlock`
- Sends `authorizedSats` to `merchantPkh`
- Returns remainder back to the same contract

### Compile Contract

```bash
npm run compile-contracts
# Outputs → src/contracts/AutoPaySubscription.json
```

---

## On-Chain Proof

Every subscription funding and merchant claim is a real BCH transaction on ChipNet.

### View Merchant Incoming Claims
```
https://chipnet.imaginary.cash/address/<MERCHANT_ADDRESS>
```

### View a Specific Transaction
After a successful claim, the API returns a `txid`. View it at:
```
https://chipnet.imaginary.cash/tx/<txid>
```

### View Contract UTXOs
```
https://chipnet.imaginary.cash/address/<contractAddress>
```

### Useful ChipNet Links
| Resource | URL |
|---|---|
| ChipNet Electrum | `chipnet.imaginary.cash:50004` |
| ChipNet Explorer | https://chipnet.imaginary.cash |
| ChipNet Chaingraph | https://chipnet.chaingraph.cash |
| tBCH Faucet | https://tbch.googol.cash |
| Cashonize Wallet (CashTokens) | https://cashonize.com |
| Paytaca Wallet | https://www.paytaca.com |

---

## Scripts

| Script | Command | Description |
|---|---|---|
| Dev server | `npm run dev` | Start with hot reload (tsx) on port 3000 |
| Build | `npm run build` | Compile TypeScript → `dist/` |
| Start (prod) | `npm start` | Run compiled `dist/server/index.js` |
| Tests | `npm test` | Run integration test suite |
| Compile contracts | `npm run compile-contracts` | Recompile CashScript → JSON artifact |
| ChipNet E2E | `npx tsx scripts/chipnet-e2e.ts` | Live end-to-end wizard on ChipNet |

---

## Testing

```bash
npm test
```

26 tests covering:

| Suite | Tests |
|---|---|
| Crypto utils | Key generation, PKH derivation, NFT commitment encode/decode |
| BIP-21 builder | URI construction with optional fields |
| JWT utils | Sign/verify per-call and subscription tokens |
| Subscription store | CRUD, nonce single-use, persistence |
| Contract instantiation | Deterministic address, different params |
| HTTP server routes | health, 402 flow, verify-payment, deploy-subscription, subscription/list |

Tests use real `@bitauth/libauth` and `cashscript` — nothing is mocked. The Electrum connection is gracefully skipped in test environment (`JEST_WORKER_ID` guard).

---

## Known Limitations (Current State)

This is an **MVP / hackathon prototype**. Key known limitations:

1. **Flat JSON persistence** — `data/subscriptions.json` has no schema validation or migrations. A server restart with stale data can cause state desynchronization. Fix: migrate to PostgreSQL or SQLite with strict schema.

2. **No contract versioning** — If `AutoPaySubscription.cash` is modified and recompiled, old active UTXOs on-chain become orphaned from the backend's perspective. Fix: store contract artifact hash alongside each subscription record.

3. **Subscriber WIF returned to client** — `/subscription/create-session` returns the subscriber's private key to the browser (demo only). In production, the subscriber must build and sign the genesis tx client-side.

4. **No block monitoring** — The backend does not automatically detect when `intervalBlocks` has elapsed. Merchants must manually trigger `/subscription/claim` or `/merchant/claim-all`. Fix: implement block webhook + auto-claim scheduler.

5. **Single merchant wallet** — All subscriptions flow to one `MERCHANT_ADDRESS`. Multi-tenant merchant support would require per-plan wallet configuration.

---

## Publishing

The SDK is published to npm as [`cashflow402-bch`](https://www.npmjs.com/package/cashflow402-bch) under the `narayanan-me` npm account.

### Update and Re-publish

```bash
# 1. Build
npm run build

# 2. Bump version
npm version patch   # or minor / major

# 3. Publish (requires npm login + 2FA OTP)
npm publish --ignore-scripts
```

### Install from npm
```bash
npm install cashflow402-bch
```

### Install from GitHub (auto-builds)
```bash
npm install github:Narayanan-D-05/cashflow
```

---

## License

ISC © Narayanan D — [narayanan.27csb@licet.ac.in](mailto:narayanan.27csb@licet.ac.in)

GitHub: [Narayanan-D-05/cashflow](https://github.com/Narayanan-D-05/cashflow)
npm: [cashflow402-bch](https://www.npmjs.com/package/cashflow402-bch)

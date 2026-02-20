# CashFlow402

**BCH-native HTTP-402 micropayment and CashToken subscription protocol.**

Pay-per-call access control and recurring subscriptions backed by Bitcoin Cash smart contracts. No custodians. No intermediaries. The covenant enforces payment rules directly on-chain.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quickstart](#quickstart)
4. [Environment Variables](#environment-variables)
5. [API Reference](#api-reference)
6. [SDK Usage](#sdk-usage)
7. [ChipNet Live Test](#chipnet-live-test)
8. [CashScript Contract](#cashscript-contract)
9. [Scripts](#scripts)
10. [Testing](#testing)
11. [Project Structure](#project-structure)
12. [Publishing the SDK](#publishing-the-sdk)

---

## Overview

CashFlow402 implements two complementary payment flows:

| Flow | Use case | How it works |
|---|---|---|
| **Per-call** | Charge per API request | Client receives HTTP 402 → pays BCH → submits txid → gets short-lived JWT |
| **Subscription** | Recurring access | Subscriber locks BCH + mutable NFT in a covenant → merchant pulls one interval's payment every N blocks |

Both flows use real on-chain BCH transactions verified against the Electrum network — **nothing is mocked**.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   CashFlow402 Backend               │
│                                                     │
│  Express 5  ─────────────────────────────────────   │
│  │                                                  │
│  ├── GET  /health                                   │
│  ├── GET  /docs              ← Swagger UI           │
│  ├── GET  /openapi.json      ← OpenAPI 3.1 spec     │
│  │                                                  │
│  ├── GET  /payment/challenge                        │
│  ├── POST /verify-payment    ← per-call flow        │
│  │                                                  │
│  ├── POST /deploy-subscription                      │
│  ├── POST /subscription/fund-confirm                │
│  ├── GET  /subscription/status/:addr                │
│  ├── GET  /subscription/list                        │
│  ├── POST /subscription/claim                       │
│  ├── POST /subscription/cancel                      │
│  ├── GET  /subscription/verify                      │
│  │                                                  │
│  ├── POST /webhook/tx-confirmed                     │
│  └── POST /webhook/block                            │
│                                                     │
│  Services                                           │
│  ├── electrumService   ← WSS ChipNet/Mainnet        │
│  ├── txVerifier        ← on-chain UTXO verification │
│  ├── subscriptionStore ← in-memory state            │
│  └── deploy            ← CashScript covenant        │
└─────────────────────────────────────────────────────┘
        │
        │ WSS
        ▼
  chipnet.imaginary.cash:50004   (ChipNet Electrum)
```

**Smart contract**: `contracts/AutoPaySubscription.cash`
- `claim()` — merchant pulls `authorizedSats` after `intervalBlocks` have elapsed; updates the mutable NFT commitment.
- `cancel()` — subscriber sweeps the remaining balance and destroys the NFT.

---

## Quickstart

### Prerequisites

- Node.js ≥ 18
- A ChipNet (BCH testnet) wallet funded from [tbch.googol.cash](https://tbch.googol.cash)
- A CashToken-aware wallet ([Cashonize](https://cashonize.com)) for the subscriber side

### Install

```bash
git clone https://github.com/Narayanan-D-05/cashflow.git
cd cashflow
npm install
```

### Configure

```bash
cp .env.example .env
```

Edit `.env` — the only required field for local dev is `MERCHANT_WIF`:

```bash
# Generate a ChipNet keypair:
node -e "
import('@bitauth/libauth').then(lib => {
  const priv = lib.generatePrivateKey(() =>
    require('node:crypto').getRandomValues(new Uint8Array(32)));
  console.log('WIF :', lib.encodePrivateKeyWif(priv, 'testnet'));
  const pub  = lib.secp256k1.derivePublicKeyCompressed(priv);
  const pkh  = lib.hash160(pub);
  console.log('Addr:', lib.encodeCashAddress('bchtest', 'p2pkh', pkh));
})"
```

Set `MERCHANT_WIF` and `MERCHANT_ADDRESS` in `.env`, then fund that address from the faucet.

### Run

```bash
npm run dev        # tsx watch — server starts at http://localhost:3000
npm run build      # compile to dist/
npm start          # run compiled dist/server/index.js
```

Open **http://localhost:3000/docs** for the interactive Swagger UI.

---

## Environment Variables

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
| `MERCHANT_ADDRESS` | *(required)* | Merchant BCH address |
| `DEFAULT_PERCALL_RATE_SATS` | `100` | Default per-call payment (sats) |
| `DEFAULT_INTERVAL_BLOCKS` | `144` | Default subscription interval (~1 day) |
| `DEFAULT_AUTHORIZED_SATS` | `50000` | Default max sats per interval |
| `WEBHOOK_SECRET` | `''` | Shared secret for `/webhook/*` endpoints |

---

## API Reference

Full interactive docs at **`GET /docs`** (Swagger UI) and machine-readable spec at **`GET /openapi.json`**.

### Per-call Flow

```
Client                         Server
  │                              │
  │── GET /api/premium/hello ───▶│
  │◀── 402 + {nonce, paymentUri}─│
  │                              │
  │ [broadcasts BCH tx]          │
  │                              │
  │── POST /verify-payment ─────▶│  { txid, nonce }
  │◀── 200 + { accessToken } ───│
  │                              │
  │── GET /api/premium/hello ───▶│  Authorization: Bearer <token>
  │◀── 200 + {data} ────────────│
```

#### `GET /payment/challenge`
Returns a payment challenge without gating an endpoint — useful for SDK testing.

**Response 200:**
```json
{
  "nonce":           "550e8400-e29b-41d4-a716-446655440000",
  "paymentUri":      "bitcoincash:qr...?amount=0.000001&label=CashFlow402",
  "amountSats":      100,
  "merchantAddress": "bchtest:qp...",
  "verifyUrl":       "http://localhost:3000/verify-payment",
  "expiresAt":       1708434000
}
```

#### `POST /verify-payment`
```json
// Request
{ "txid": "abc123...", "nonce": "550e8400..." }

// Response 200
{ "accessToken": "eyJ...", "expiresInSeconds": 60 }
```

---

### Subscription Flow

```
Subscriber                     Server                      Covenant (BCH)
    │                              │                             │
    │─ POST /deploy-subscription ─▶│                             │
    │◀─ { contractAddress,         │                             │
    │      tokenAddress,           │                             │
    │      genesisCommitment,      │                             │
    │      fundingUri }            │                             │
    │                              │                             │
    │ [broadcasts genesis NFT tx] ─────────────────────────────▶│
    │                              │                             │
    │─ POST /fund-confirm ────────▶│                             │
    │◀─ { status: "active" } ─────│                             │
    │                              │                             │
                               Merchant                          │
                                  │─ POST /subscription/claim ──▶│
                                  │◀─ { txid, claimedSats } ────│ (covenant enforces interval + amount)
```

#### `POST /deploy-subscription`
```json
// Request
{
  "subscriberAddress": "bchtest:qr...",
  "intervalBlocks":    144,
  "authorizedSats":    50000
}

// Response 201
{
  "contractAddress":   "bchtest:pr...",
  "tokenAddress":      "bchtest:zr...",
  "genesisCommitment": "800d00002050c300",
  "fundingUri":        "bitcoincash:zr...?amount=0.002&token-category=...",
  "startBlock":        900123,
  "intervalBlocks":    144,
  "authorizedSats":    50000
}
```

#### `POST /subscription/fund-confirm`
```json
// Request
{
  "txid":            "deadbeef...",
  "tokenCategory":   "deadbeef...",
  "contractAddress": "bchtest:pr..."
}

// Response 200
{ "message": "Subscription activated.", "balance": 200000 }
```

#### `GET /subscription/status/:contractAddress`
```json
{
  "contractAddress":     "bchtest:pr...",
  "status":              "active",
  "balance":             "200000",
  "currentBlock":        900150,
  "nextClaimAfterBlock": 900267,
  "blocksUntilNextClaim":117,
  "canClaimNow":         false
}
```

#### `POST /subscription/claim`
```json
// Request
{ "contractAddress": "bchtest:pr...", "tokenCategory": "deadbeef..." }

// Response 200
{
  "txid":                "c0ffee...",
  "claimedSats":         50000,
  "nextClaimAfterBlock": 900411
}
```

#### `POST /subscription/cancel`
```json
// Request
{ "contractAddress": "bchtest:pr...", "subscriberWif": "cQHp..." }

// Response 200
{ "message": "Subscription cancelled.", "txid": "babe00...", "refundedSats": "150000" }
```

---

## SDK Usage

```typescript
import { CashFlow402Client } from './src/sdk/index.js'; // or from '@narayanan-me/cashflow402'

const client = new CashFlow402Client({
  subscriberWif:  'cQHp...',          // subscriber private key
  network:        'chipnet',
  serverUrl:      'http://localhost:3000',
});

// ── Per-call: auto-pay any 402 endpoint ──────────────────────────────────────
const response = await client.fetch('http://localhost:3000/api/premium/hello');
console.log(await response.json());

// ── Subscription: create + fund ───────────────────────────────────────────────
const { contractAddress, tokenCategory } = await client.createSubscription({
  depositSats:    200_000,
  intervalBlocks: 144,
  autoFund:       true,   // automatically build + broadcast the genesis NFT tx
});

// ── Subscription: get access token ────────────────────────────────────────────
const { accessToken } = await client.getSubscriptionToken(tokenCategory);

// ── Subscription: access gated content ───────────────────────────────────────
const res = await client.fetch('http://localhost:3000/api/premium/data', {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

---

## ChipNet Live Test

An interactive end-to-end script walks through the full subscription lifecycle against the live ChipNet network.

### Setup

1. Start the server:
   ```bash
   npm run dev
   ```

2. Make sure `MERCHANT_WIF` in `.env` is a funded ChipNet key.

3. Optionally set `SUBSCRIBER_WIF` in `.env` to auto-sign cancel transactions. If omitted, the script generates a fresh keypair.

### Run

```bash
npx tsx scripts/chipnet-e2e.ts
```

The script will:
1. Generate (or import) a subscriber keypair
2. Call `POST /deploy-subscription`
3. Print the funding URI and genesis commitment
4. Wait for you to broadcast the funding transaction (with a CashToken-aware wallet like [Cashonize](https://cashonize.com))
5. Call `POST /subscription/fund-confirm` with the txid + tokenCategory you enter
6. Poll `GET /subscription/status` until the claim window opens
7. Call `POST /subscription/claim`
8. Print the claim txid + ChipNet explorer link

**ChipNet faucet**: https://tbch.googol.cash  
**Cashonize** (CashToken wallet): https://cashonize.com  
**ChipNet explorer**: https://chipnet.chaingraph.cash

---

## CashScript Contract

`contracts/AutoPaySubscription.cash`

```solidity
pragma cashscript ^0.12.0;

contract AutoPaySubscription(
    bytes20 merchantPkh,
    bytes20 subscriberPkh,
    int     intervalBlocks
) {
    function claim(pubkey merchantPk, sig merchantSig) { ... }
    function cancel(pubkey subscriberPk, sig subscriberSig) { ... }
}
```

The contract state is stored in a **mutable NFT commitment** (8 bytes):

```
[lastClaimBlock: int32LE] [authorizedSats: int32LE]
```

On every `claim()`:
- Covenant checks `tx.locktime ≥ lastClaimBlock + intervalBlocks`
- Checks claim amount `≤ authorizedSats`
- Updates commitment with new `lastClaimBlock`

### Compile

```bash
npm run compile-contracts
# → src/contracts/AutoPaySubscription.json
```

---

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start server with hot reload (tsx) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled server |
| `npm test` | Run 26 integration tests |
| `npm run compile-contracts` | Recompile CashScript → JSON artifact |
| `npx tsx scripts/chipnet-e2e.ts` | Live ChipNet end-to-end wizard |

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
| Subscription store | CRUD, nonce single-use |
| Contract instantiation | Deterministic address, different params |
| HTTP server routes | health, 402 flow, verify-payment, deploy-subscription, subscription/list |

Tests use real `@bitauth/libauth` and `cashscript` — nothing is mocked. The Electrum connection is gracefully skipped in the test environment (`JEST_WORKER_ID` guard).

---

## Project Structure

```
cashflow/
├── contracts/
│   └── AutoPaySubscription.cash      # CashScript covenant
├── scripts/
│   └── chipnet-e2e.ts                # Live ChipNet E2E test wizard
├── src/
│   ├── contracts/
│   │   ├── AutoPaySubscription.json  # Compiled artifact
│   │   └── deploy.ts                 # Contract factory + claim/cancel tx builders
│   ├── sdk/
│   │   └── index.ts                  # CashFlow402Client SDK
│   ├── server/
│   │   ├── index.ts                  # Express entry point
│   │   ├── openapi.ts                # OpenAPI 3.1 spec
│   │   ├── middleware/
│   │   │   └── require402.ts         # HTTP-402 access control middleware
│   │   └── routes/
│   │       ├── payment.ts            # Per-call flow
│   │       ├── subscription.ts       # Subscription lifecycle
│   │       └── webhook.ts            # On-chain event webhooks
│   ├── services/
│   │   ├── electrumService.ts        # Electrum WSS singleton
│   │   ├── subscriptionStore.ts      # In-memory subscription + nonce store
│   │   └── txVerifier.ts             # On-chain payment verification
│   ├── utils/
│   │   ├── bip21.ts                  # BIP-21 URI builder
│   │   ├── crypto.ts                 # libauth key/address/NFT helpers
│   │   └── jwt.ts                    # JWT sign/verify
│   └── types.ts                      # Shared TypeScript interfaces
├── tests/
│   └── subscription.test.ts          # 26 integration tests
├── .env.example
├── jest.config.ts
├── tsconfig.json
└── package.json
```

---

## Publishing the SDK

The `src/sdk/index.ts` module (`CashFlow402Client`) can be published as a standalone npm package.

```bash
# 1. Update name/version in package.json
#    "name": "@narayanan-me/cashflow402"

# 2. Build
npm run build

# 3. Publish
npm publish --access public
```

Consumers install it with:

```bash
npm install @narayanan-me/cashflow402
```

```typescript
import { CashFlow402Client } from '@narayanan-me/cashflow402';
```

---

## License

ISC © Narayanan D

/**
 * tests/subscription.test.ts
 * Integration tests for the CashFlow402 backend.
 *
 * These tests cover:
 *   1. Crypto utils (key generation, address derivation, NFT commitment encoding)
 *   2. BIP-21 URI builder
 *   3. JWT sign / verify round-trip
 *   4. Subscription store CRUD
 *   5. Contract instantiation (determinism check)
 *   6. HTTP server routes (supertest)
 *
 * NOTE: Tests that interact with ChipNet (Electrum / on-chain) are marked
 * with the `@chipnet` tag and are skipped in CI unless CHIPNET=true is set.
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

// ─── Import modules under test ────────────────────────────────────────────────

import {
  generateKeyPair,
  wifToKeyPair,
  addressToPkh,
  buildNftCommitment,
  parseNftCommitment,
  toHex,
  int32ToLeBytes,
  leBytesToInt32,
} from '../src/utils/crypto.js';

import { buildPaymentUri, buildPerCallUri } from '../src/utils/bip21.js';

import {
  signPerCallToken,
  signSubscriptionToken,
  verifyAccessToken,
} from '../src/utils/jwt.js';

import {
  addSubscription,
  getByAddress,
  getByCategory,
  updateSubscription,
  storeNonce,
  consumeNonce,
  getAllSubscriptions,
} from '../src/services/subscriptionStore.js';

import { instantiateSubscriptionContract } from '../src/contracts/deploy.js';

import { app } from '../src/server/index.js';

// ─── Test environment ─────────────────────────────────────────────────────────

// Minimum env vars required for unit tests (no real keys or network)
process.env['JWT_SECRET']          = 'test-jwt-secret-for-unit-tests-only';
process.env['BCH_NETWORK']         = 'chipnet';
process.env['MERCHANT_ADDRESS']    = 'bchtest:qpumqqygwcnt999fz3gp5nxjy66ckg6esvmzshj478';
process.env['DEFAULT_PERCALL_RATE_SATS'] = '100';
process.env['JWT_EXPIRY_PERCALL']  = '60';
process.env['JWT_EXPIRY_SUBSCRIPTION'] = '3600';

// ─── Crypto utils ─────────────────────────────────────────────────────────────

describe('Crypto utils', () => {
  it('generateKeyPair returns a valid BCH key pair', () => {
    const kp = generateKeyPair('chipnet');
    expect(kp.address).toMatch(/^bchtest:/);
    expect(kp.wif).toHaveLength(52);
    expect(kp.pkh).toHaveLength(20);
    expect(kp.publicKey).toHaveLength(33);
  });

  it('wifToKeyPair round-trips through a generated key pair', () => {
    const kp1 = generateKeyPair('chipnet');
    const kp2 = wifToKeyPair(kp1.wif, 'chipnet');
    expect(toHex(kp2.pkh)).toEqual(toHex(kp1.pkh));
    expect(kp2.address).toEqual(kp1.address);
  });

  it('addressToPkh extracts 20-byte hash from a chipnet address', () => {
    const kp  = generateKeyPair('chipnet');
    const pkh = addressToPkh(kp.address);
    expect(pkh).toHaveLength(20);
    expect(toHex(pkh)).toEqual(toHex(kp.pkh));
  });

  it('int32ToLeBytes / leBytesToInt32 round-trip', () => {
    for (const n of [0, 1, 100, 144, 1_000_000, -1]) {
      const bytes = int32ToLeBytes(n);
      expect(bytes).toHaveLength(4);
      expect(leBytesToInt32(bytes)).toEqual(n);
    }
  });

  it('buildNftCommitment / parseNftCommitment round-trip', () => {
    const commitment = buildNftCommitment(800_000, 50_000);
    expect(commitment).toHaveLength(16); // 8 bytes = 16 hex chars
    const { lastClaimBlock, authorizedSats } = parseNftCommitment(commitment);
    expect(lastClaimBlock).toBe(800_000);
    expect(authorizedSats).toBe(50_000);
  });
});

// ─── BIP-21 URI builder ────────────────────────────────────────────────────────

describe('BIP-21 payment URI', () => {
  const address = 'bchtest:qpumqqygwcnt999fz3gp5nxjy66ckg6esvmzshj478';

  it('builds a valid BIP-21 URI', () => {
    const uri = buildPaymentUri({ address, amountSats: 100 });
    expect(uri).toContain('?amount=');
    expect(uri).toContain('0.00000100');
  });

  it('includes optional label and message fields', () => {
    const uri = buildPaymentUri({ address, amountSats: 500, label: 'Test', message: 'Hello' });
    expect(uri).toContain('label=Test');
    expect(uri).toContain('message=Hello');
  });

  it('includes tokenCategory (c= param) for CashToken payments', () => {
    const uri = buildPaymentUri({ address, amountSats: 500, tokenCategory: 'deadbeef' });
    expect(uri).toContain('c=deadbeef');
  });

  it('buildPerCallUri includes nonce field', () => {
    const uri = buildPerCallUri({ merchantAddress: address, amountSats: 100, nonce: 'test-nonce', apiPath: '/api/data' });
    expect(uri).toContain('nonce=test-nonce');
  });
});

// ─── JWT ──────────────────────────────────────────────────────────────────────

describe('JWT utils', () => {
  it('signPerCallToken issues a verifiable percall token', () => {
    const token   = signPerCallToken({ txid: 'abc123', amountSats: 100, nonce: 'n1' });
    const payload = verifyAccessToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.type).toBe('percall');
  });

  it('signSubscriptionToken issues a verifiable subscription token', () => {
    const token   = signSubscriptionToken({ tokenCategory: 'cafebabe', contractAddress: 'bchtest:q...' });
    const payload = verifyAccessToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.type).toBe('subscription');
  });

  it('verifyAccessToken returns null for tampered token', () => {
    const token   = signPerCallToken({ txid: 'abc', amountSats: 100, nonce: 'n2' });
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(verifyAccessToken(tampered)).toBeNull();
  });
});

// ─── Subscription store ───────────────────────────────────────────────────────

describe('Subscription store', () => {
  const testRecord = {
    contractAddress:  'bchtest:contract_test_address',
    tokenCategory:    'deadbeef01020304',
    merchantPkh:      'aa'.repeat(20),
    subscriberPkh:    'bb'.repeat(20),
    subscriberAddress: 'bchtest:qsubscriber',
    merchantAddress:  'bchtest:qmerchant',
    intervalBlocks:   144,
    authorizedSats:   50_000n,
    lastClaimBlock:   800_000,
    balance:          200_000n,
    status:           'active' as const,
    createdAt:        new Date().toISOString(),
    updatedAt:        new Date().toISOString(),
  };

  beforeAll(() => {
    addSubscription(testRecord);
  });

  it('getByAddress returns the subscription', () => {
    const rec = getByAddress(testRecord.contractAddress);
    expect(rec).toBeDefined();
    expect(rec!.tokenCategory).toBe(testRecord.tokenCategory);
  });

  it('getByCategory returns the subscription', () => {
    const rec = getByCategory(testRecord.tokenCategory);
    expect(rec).toBeDefined();
    expect(rec!.contractAddress).toBe(testRecord.contractAddress);
  });

  it('updateSubscription patches fields', () => {
    const updated = updateSubscription(testRecord.contractAddress, { balance: 150_000n });
    expect(updated!.balance).toBe(150_000n);
    expect(getByAddress(testRecord.contractAddress)!.balance).toBe(150_000n);
  });

  it('getAllSubscriptions returns all records', () => {
    const all = getAllSubscriptions();
    expect(all.length).toBeGreaterThan(0);
  });
});

// ─── Nonce store ──────────────────────────────────────────────────────────────

describe('Nonce store', () => {
  it('storeNonce and consumeNonce (single use)', () => {
    const nonce = 'test-nonce-' + Date.now();
    storeNonce(nonce, {
      merchantAddress: 'bchtest:q...',
      amountSats: 100,
      apiPath: '/test',
      expiresAt: Date.now() + 60_000,
      consumed: false,
    });
    const rec1 = consumeNonce(nonce);
    expect(rec1).not.toBeNull();
    const rec2 = consumeNonce(nonce); // second consume must fail
    expect(rec2).toBeNull();
  });
});

// ─── Contract instantiation ───────────────────────────────────────────────────

describe('Contract instantiation', () => {
  it('produces a deterministic contract address for given params', () => {
    // Use fixed PKH values so the test is reproducible
    const merchantPkhHex   = '0'.repeat(40);  // 20 zero bytes
    const subscriberPkhHex = 'f'.repeat(40);  // 20 ff bytes
    const intervalBlocks   = 144;

    // BCH_NETWORK must be set (we set it above)
    const d1 = instantiateSubscriptionContract({ merchantPkhHex, subscriberPkhHex, intervalBlocks });
    const d2 = instantiateSubscriptionContract({ merchantPkhHex, subscriberPkhHex, intervalBlocks });

    expect(d1.contractAddress).toBe(d2.contractAddress);
    expect(d1.tokenAddress).toBe(d2.tokenAddress);
    expect(d1.contractAddress).toMatch(/^bchtest:/);
  });

  it('produces different addresses for different intervalBlocks', () => {
    const opts = {
      merchantPkhHex:   '0'.repeat(40),
      subscriberPkhHex: 'f'.repeat(40),
    };
    const d144  = instantiateSubscriptionContract({ ...opts, intervalBlocks: 144 });
    const d1008 = instantiateSubscriptionContract({ ...opts, intervalBlocks: 1008 });
    expect(d144.contractAddress).not.toBe(d1008.contractAddress);
  });
});

// ─── HTTP routes (supertest) ──────────────────────────────────────────────────

describe('HTTP server routes', () => {
  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('CashFlow402');
  });

  it('GET /api/premium/hello without token returns 402', async () => {
    const res = await request(app).get('/api/premium/hello');
    expect(res.status).toBe(402);
    expect(res.body.paymentUri).toBeDefined();
    expect(res.body.nonce).toBeDefined();
  });

  it('GET /api/premium/hello with valid percall JWT returns 200', async () => {
    const token = signPerCallToken({ txid: 'fakeTxid', amountSats: 100, nonce: 'fakeNonce' });
    const res = await request(app)
      .get('/api/premium/hello')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('paid');
  });

  it('POST /verify-payment without body returns 400', async () => {
    const res = await request(app).post('/verify-payment').send({});
    expect(res.status).toBe(400);
  });

  it('POST /deploy-subscription without subscriberAddress returns 400', async () => {
    const res = await request(app).post('/deploy-subscription').send({});
    expect(res.status).toBe(400);
  });

  it('GET /payment/challenge returns a valid challenge object', async () => {
    const res = await request(app).get('/payment/challenge');
    expect(res.status).toBe(200);
    expect(res.body.paymentUri).toBeDefined();
    expect(res.body.nonce).toBeDefined();
    expect(res.body.amountSats).toBe(100);
  });

  it('GET /subscription/list returns an array', async () => {
    const res = await request(app).get('/subscription/list');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.subscriptions)).toBe(true);
  });
});

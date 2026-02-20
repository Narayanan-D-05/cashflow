/**
 * src/sdk/index.ts
 * CashFlow402 JS SDK
 *
 * A developer-facing library for:
 *   1. Per-call automated micropayment: detects 402 responses, pays,
 *      and retries the original request transparently.
 *   2. Subscription management: creates and monitors BCH covenant subscriptions.
 *
 * Usage (server-side Node.js):
 *
 *   import { CashFlow402Client } from './sdk/index.js';
 *
 *   const client = new CashFlow402Client({
 *     walletWif: 'L4ax...',
 *     network:   'chipnet',
 *     serverUrl: 'https://autopay.example.com',
 *   });
 *
 *   // Per-call — automatically pays the 402 and returns the API response
 *   const data = await client.fetch('https://api.example.com/api/premium/data');
 *
 *   // Subscription — deploy once, access many times
 *   const sub = await client.createSubscription({
 *     apiServerUrl: 'https://api.example.com',
 *     depositSats:  200_000,
 *   });
 */

import https from 'node:https';
import http  from 'node:http';
import { URL } from 'node:url';
import { ElectrumNetworkProvider, SignatureTemplate, TransactionBuilder, Network } from 'cashscript';
import { wifToKeyPair, buildNftCommitment, parseNftCommitment, toHex } from '../utils/crypto.js';
import { signPerCallToken } from '../utils/jwt.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CashFlow402ClientOptions {
  /** WIF-encoded private key for the payer wallet */
  walletWif: string;
  /** 'mainnet' | 'chipnet' | 'testnet3' | 'testnet4' */
  network?: string;
  /** Base URL of the CashFlow402 server (for subscription management) */
  serverUrl?: string;
}

export interface PaymentChallenge402 {
  paymentUri:     string;
  amountSats:     number;
  merchantAddress: string;
  nonce:          string;
  verifyUrl:      string;
  expiresAt:      number;
}

export interface FetchOptions {
  method?:  string;
  headers?: Record<string, string>;
  body?:    string;
  /** Max number of times to retry after payment. Default: 1 */
  maxPaymentRetries?: number;
}

export interface SubscriptionInfo {
  contractAddress:  string;
  tokenAddress:     string;
  tokenCategory:    string;
  intervalBlocks:   number;
  authorizedSats:   number;
  fundingTxid?:     string;
}

// ─── HTTP helpers (native Node.js, no fetch dependency) ──────────────────────

interface HttpResponse {
  statusCode: number;
  headers:    Record<string, string | string[]>;
  body:       string;
}

async function httpRequest(
  urlStr: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib  = url.protocol === 'https:' ? https : http;

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (body) reqHeaders['Content-Length'] = Buffer.byteLength(body).toString();

    const req = lib.request(
      {
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'https:' ? '443' : '80'),
        path:     url.pathname + url.search,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers:    res.headers as Record<string, string | string[]>,
            body:       data,
          });
        });
      },
    );

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── CashFlow402Client ────────────────────────────────────────────────────────

export class CashFlow402Client {
  private walletWif:  string;
  private network:    string;
  private serverUrl:  string;
  private provider:   ElectrumNetworkProvider;
  private accessToken: string | null = null;

  constructor(opts: CashFlow402ClientOptions) {
    this.walletWif  = opts.walletWif;
    this.network    = opts.network  ?? Network.CHIPNET;
    this.serverUrl  = opts.serverUrl ?? 'http://localhost:3000';
    this.provider   = new ElectrumNetworkProvider(
      this.network as typeof Network[keyof typeof Network],
    );
  }

  // ─── Per-Call Payments ──────────────────────────────────────────────────────

  /**
   * Perform an HTTP request to a CashFlow402-protected endpoint.
   *
   * If the server responds with 402, this method:
   *   1. Parses the payment challenge from the response body.
   *   2. Builds and broadcasts a BCH payment transaction.
   *   3. Calls the server's /verify-payment endpoint to get a JWT.
   *   4. Retries the original request with the JWT in the Authorization header.
   *
   * Returns the final response body (JSON-parsed).
   */
  async fetch(url: string, opts: FetchOptions = {}): Promise<unknown> {
    const {
      method  = 'GET',
      headers = {},
      body,
      maxPaymentRetries = 1,
    } = opts;

    let attempts = 0;

    while (attempts <= maxPaymentRetries) {
      const reqHeaders: Record<string, string> = { ...headers };
      if (this.accessToken) {
        reqHeaders['Authorization'] = `Bearer ${this.accessToken}`;
      }

      const response = await httpRequest(url, method, reqHeaders, body);

      if (response.statusCode !== 402) {
        // Success or non-402 error — return as-is
        try {
          return JSON.parse(response.body);
        } catch {
          return response.body;
        }
      }

      if (attempts >= maxPaymentRetries) {
        throw new Error(`402 Payment Required and max retries (${maxPaymentRetries}) reached.`);
      }

      // Parse the payment challenge
      let challenge: PaymentChallenge402;
      try {
        challenge = JSON.parse(response.body) as PaymentChallenge402;
      } catch {
        throw new Error('Could not parse 402 payment challenge from server response.');
      }

      console.log(`[CashFlow402 SDK] Paying ${challenge.amountSats} sats to ${challenge.merchantAddress.slice(0, 20)}…`);

      // Pay and get a JWT
      const token = await this.payChallenge(challenge, url);
      this.accessToken = token;

      attempts++;
    }

    throw new Error('Unreachable: fetch loop exited without returning.');
  }

  /**
   * Pay a 402 challenge and return a JWT access token.
   * This sends a real BCH transaction on ChipNet / mainnet.
   */
  async payChallenge(challenge: PaymentChallenge402, originalUrl: string): Promise<string> {
    const keyPair = wifToKeyPair(this.walletWif, this.network);

    // Fetch payer UTXOs
    const utxos = await this.provider.getUtxos(keyPair.address);
    if (utxos.length === 0) {
      throw new Error(`No UTXOs found for payer address ${keyPair.address} on ${this.network}.`);
    }

    const requiredSats  = BigInt(challenge.amountSats);
    const MINER_FEE     = 2000n;
    const totalIn       = utxos[0]!.satoshis;

    if (totalIn < requiredSats + MINER_FEE) {
      throw new Error(
        `Insufficient balance: have ${totalIn} sats, need ${requiredSats + MINER_FEE} sats.`,
      );
    }

    const sigTemplate = new SignatureTemplate(keyPair.privateKey);
    const txBuilder   = new TransactionBuilder({ provider: this.provider });

    txBuilder.addInput(utxos[0]!, sigTemplate.unlockP2PKH());
    txBuilder.addOutput({ to: challenge.merchantAddress, amount: requiredSats });

    const change = totalIn - requiredSats - MINER_FEE;
    if (change > 546n) {
      txBuilder.addOutput({ to: keyPair.address, amount: change });
    }

    const txDetails = await txBuilder.send();
    console.log(`[CashFlow402 SDK] Payment broadcasted: txid=${txDetails.txid}`);

    // Call verify-payment to exchange txid+nonce for a JWT
    const verifyRes = await httpRequest(
      challenge.verifyUrl,
      'POST',
      {},
      JSON.stringify({ txid: txDetails.txid, nonce: challenge.nonce }),
    );

    if (verifyRes.statusCode !== 200) {
      throw new Error(`verify-payment failed: ${verifyRes.body}`);
    }

    const { accessToken } = JSON.parse(verifyRes.body) as { accessToken: string };
    return accessToken;
  }

  // ─── Subscription Management ───────────────────────────────────────────────

  /**
   * Create a new subscription with the configured CashFlow402 server.
   * After the subscription is deployed, you must fund the returned contract
   * address with `depositSats` BCH + a mutable NFT.
   *
   * This method does the funding automatically if `autoFund: true` (default).
   */
  async createSubscription(opts: {
    depositSats:    number;
    intervalBlocks?: number;
    autoFund?:      boolean;
  }): Promise<SubscriptionInfo> {
    const keyPair = wifToKeyPair(this.walletWif, this.network);

    // 1. Request contract deployment from the server
    const deployRes = await httpRequest(
      `${this.serverUrl}/deploy-subscription`,
      'POST',
      {},
      JSON.stringify({
        subscriberAddress: keyPair.address,
        intervalBlocks:    opts.intervalBlocks,
        authorizedSats:    Math.floor(opts.depositSats / 4),
      }),
    );

    if (deployRes.statusCode !== 201) {
      throw new Error(`deploy-subscription failed: ${deployRes.body}`);
    }

    const deployed = JSON.parse(deployRes.body) as {
      contractAddress:  string;
      tokenAddress:     string;
      tokenCategory:    string;
      genesisCommitment: string;
      startBlock:       number;
      intervalBlocks:   number;
      authorizedSats:   number;
    };

    const info: SubscriptionInfo = {
      contractAddress: deployed.contractAddress,
      tokenAddress:    deployed.tokenAddress,
      tokenCategory:   deployed.tokenCategory,
      intervalBlocks:  deployed.intervalBlocks,
      authorizedSats:  deployed.authorizedSats,
    };

    if (opts.autoFund !== false) {
      const fundingTxid = await this.fundSubscription({
        contractTokenAddress: deployed.tokenAddress,
        depositSats:         opts.depositSats,
        genesisCommitment:   deployed.genesisCommitment,
        startBlock:          deployed.startBlock,
        authorizedSats:      deployed.authorizedSats,
      });
      info.fundingTxid = fundingTxid;
      console.log(`[CashFlow402 SDK] Subscription funded: txid=${fundingTxid}`);

      // Notify the server about the funding transaction
      // The real tokenCategory = the txid of the genesis input
      await httpRequest(
        `${this.serverUrl}/subscription/fund-confirm`,
        'POST',
        {},
        JSON.stringify({
          txid:            fundingTxid,
          tokenCategory:   fundingTxid, // genesis: NFT category = input 0 txid
          contractAddress: deployed.contractAddress,
        }),
      );
    }

    return info;
  }

  /**
   * Build and broadcast the genesis funding transaction.
   *
   * This transaction:
   *   - Spends a UTXO from the subscriber's wallet (input 0)
   *   - Sends `depositSats` BCH to the contract's tokenAddress
   *   - Creates a mutable NFT with the genesis commitment
   *   - The NFT's category = input 0's txid (BCH genesis rule)
   */
  private async fundSubscription(opts: {
    contractTokenAddress: string;
    depositSats:     number;
    genesisCommitment: string;
    startBlock:      number;
    authorizedSats:  number;
  }): Promise<string> {
    const keyPair = wifToKeyPair(this.walletWif, this.network);
    const utxos   = await this.provider.getUtxos(keyPair.address);

    if (utxos.length === 0) {
      throw new Error(`No UTXOs for subscriber ${keyPair.address}`);
    }

    const MINER_FEE  = 2000n;
    const depositAmt = BigInt(opts.depositSats);
    let totalIn      = 0n;
    const selectedUtxos = [];

    for (const utxo of utxos) {
      if (utxo.token) continue; // skip existing token UTXOs
      selectedUtxos.push(utxo);
      totalIn += utxo.satoshis;
      if (totalIn >= depositAmt + MINER_FEE) break;
    }

    if (totalIn < depositAmt + MINER_FEE) {
      throw new Error(`Insufficient balance for subscription funding.`);
    }

    const sigTemplate = new SignatureTemplate(keyPair.privateKey);
    const txBuilder   = new TransactionBuilder({ provider: this.provider });

    for (const utxo of selectedUtxos) {
      txBuilder.addInput(utxo, sigTemplate.unlockP2PKH());
    }

    // Genesis NFT: the category will be determined by the txid of
    // the first input (BCH token genesis rule).
    // CashScript TransactionBuilder supports genesis token creation
    // by using the input's txid as the category.
    txBuilder.addOutput({
      to:    opts.contractTokenAddress,
      amount: depositAmt,
      token: {
        amount:   0n,
        category: selectedUtxos[0]!.txid, // genesis rule: category = input 0 txid
        nft: {
          capability: 'mutable',
          commitment: opts.genesisCommitment,
        },
      },
    });

    const change = totalIn - depositAmt - MINER_FEE;
    if (change > 546n) {
      txBuilder.addOutput({ to: keyPair.address, amount: change });
    }

    const txDetails = await txBuilder.send();
    return txDetails.txid;
  }

  /**
   * Get a subscription access JWT from the server.
   * Used to authorize API calls under a subscription model.
   */
  async getSubscriptionToken(tokenCategory: string): Promise<string> {
    const res = await httpRequest(
      `${this.serverUrl}/subscription/verify?tokenCategory=${tokenCategory}`,
      'GET',
      {},
    );

    if (res.statusCode !== 200) {
      throw new Error(`getSubscriptionToken failed: ${res.body}`);
    }

    const { accessToken } = JSON.parse(res.body) as { accessToken: string };
    return accessToken;
  }
}

/**
 * src/types.ts
 * Shared TypeScript interfaces and types for CashFlow402.
 */

// ─── Subscription ─────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'pending_funding' | 'active' | 'cancelled' | 'expired';
export type SubscriptionTier = 'basic' | 'pro';

export interface SubscriptionRecord {
  /** BCH P2SH address of the AutoPaySubscription covenant */
  contractAddress: string;
  /** Token-aware address (P2SH20 + token prefix) — where the NFT UTXO actually lives */
  tokenAddress: string;
  /** CashToken category hex (32 bytes) minted at genesis — uniquely identifies this subscription */
  tokenCategory: string;
  /** Merchant P2PKH hash (20 bytes hex) baked into the covenant */
  merchantPkh: string;
  /** Subscriber P2PKH hash (20 bytes hex) baked into the covenant */
  subscriberPkh: string;
  /** Subscriber BCH address (bchtest:… or bitcoincash:…) */
  subscriberAddress: string;
  /** Merchant BCH address */
  merchantAddress: string;
  /** Number of BCH blocks between merchant claim intervals */
  intervalBlocks: number;
  /** Max satoshis merchant may claim per interval */
  authorizedSats: bigint;
  /** Block height of the last successful claim (or subscription start) */
  lastClaimBlock: number;
  /** Current BCH balance of the contract UTXO (satoshis) */
  balance: bigint;
  /** Lifecycle status of this subscription */
  status: SubscriptionStatus;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last-updated timestamp */
  updatedAt: string;
}

// ─── Per-Call Payments ────────────────────────────────────────────────────────

export interface PaymentChallenge {
  /** Unique nonce for this payment challenge (used to prevent replay) */
  nonce: string;
  /** BIP-21 URI the client should pay */
  paymentUri: string;
  /** Required amount in satoshis */
  amountSats: number;
  /** Merchant BCH address to pay */
  merchantAddress: string;
  /** Verification endpoint where the client submits txid + nonce */
  verifyUrl: string;
  /** Unix timestamp when this challenge expires */
  expiresAt: number;
}

// ─── JWT Payloads ─────────────────────────────────────────────────────────────

export interface PerCallTokenPayload {
  type: 'percall';
  /** BCH txid that was verified */
  txid: string;
  /** Amount paid in satoshis */
  amountSats: number;
  /** Challenge nonce consumed */
  nonce: string;
}

export interface SubscriptionTokenPayload {
  type: 'subscription';
  /** CashToken category identifying the subscription */
  tokenCategory: string;
  /** Contract address */
  contractAddress: string;
}

export type AccessTokenPayload = PerCallTokenPayload | SubscriptionTokenPayload;

// ─── API Request / Response Bodies ───────────────────────────────────────────

export interface DeploySubscriptionBody {
  /** Subscriber's BCH address (bchtest:… or bitcoincash:…) */
  subscriberAddress: string;
  /** Blocks per billing interval (default: 144 ≈ 1 day) */
  intervalBlocks?: number;
  /** Satoshis authorized per interval (default: from .env) */
  authorizedSats?: number;
}

export interface DeploySubscriptionResponse {
  contractAddress: string;
  tokenAddress: string;
  tokenCategory: string;
  fundingInstructions: string;
  intervalBlocks: number;
  authorizedSats: number;
}

export interface VerifyPaymentBody {
  /** BCH transaction ID of the payment */
  txid: string;
  /** Challenge nonce returned by the 402 response */
  nonce: string;
}

export interface VerifyPaymentResponse {
  /** Short-lived JWT granting API access */
  accessToken: string;
  /** Seconds until the token expires */
  expiresInSeconds: number;
}

export interface ClaimPaymentBody {
  contractAddress: string;
  tokenCategory: string;
}

export interface ClaimPaymentResponse {
  txid: string;
  claimedSats: number;
  nextClaimAfterBlock: number;
}

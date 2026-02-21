/**
 * lib/api.ts
 * Typed client for the CashFlow402 Express backend (localhost:3000).
 *
 * All bigint-like fields (e.g. balance, authorizedSats) come from the API
 * as strings (JSON can't represent BigInt); we expose them as-is here to
 * avoid runtime issues in the browser. Components should convert with
 * Number() when displaying.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// ─── Types (mirrors backend src/types.ts but browser-safe) ───────────────────

export type SubscriptionStatus = "active" | "paused" | "expired" | "cancelled";

export interface SubscriptionRecord {
  contractAddress: string;
  tokenCategory: string;
  merchantPkh: string;
  subscriberPkh: string;
  subscriberAddress: string;
  merchantAddress: string;
  intervalBlocks: number;
  authorizedSats: string;   // BigInt serialised as string from backend
  lastClaimBlock: number;
  balance: string;   // BigInt serialised as string from backend
  status: SubscriptionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubscriptionInput {
  merchantAddress: string;
  subscriberPrivKey: string;
  intervalBlocks: number;
  authorizedSats: number;
  initialDeposit: number;
}

export interface VerifyResult {
  accessToken: string;
  expiresInSeconds: number;
  // legacy alias just in case
  token?: string;
}

// ─── Raw fetch helpers ────────────────────────────────────────────────────────

async function get<T>(path: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`GET ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`POST ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Challenge response ─────────────────────────────────────────────────────
export interface ChallengeResult {
  paymentUri: string;
  amountSats: number;
  merchantAddress: string;
  nonce: string;
  verifyUrl: string;
  expiresAt: number;
}

export const api = {
  /** List all subscriptions */
  getAllSubscriptions(): Promise<SubscriptionRecord[]> {
    return get<SubscriptionRecord[]>("/subscription/list");
  },

  /** Get single subscription by contractAddress */
  getSubscription(contractAddress: string): Promise<SubscriptionRecord> {
    return get<SubscriptionRecord>(
      `/subscription/status/${encodeURIComponent(contractAddress)}`,
    );
  },

  /** Create a new subscription */
  createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionRecord> {
    return post<SubscriptionRecord>("/deploy-subscription", input);
  },

  /**
   * Request a per-call payment challenge from the backend.
   * Returns paymentUri (BIP-21), nonce, amount, merchant address.
   * GET /payment/challenge
   */
  getChallenge(params?: { amountSats?: number; path?: string }): Promise<ChallengeResult> {
    const qs = new URLSearchParams();
    if (params?.path) qs.set("path", params.path);
    if (params?.amountSats) qs.set("amountSats", String(params.amountSats));
    const query = qs.toString() ? `?${qs}` : "";
    return get<ChallengeResult>(`/payment/challenge${query}`);
  },

  /**
   * Verify a real on-chain BCH payment and get an access token.
   * POST /verify-payment  { txid, nonce }
   */
  verifyPayment(params: { nonce: string; txid: string }): Promise<string> {
    return post<VerifyResult>("/verify-payment", params).then(r => r.accessToken);
  },

  /** Claim subscription funds (merchant). POST /subscription/claim */
  claimSubscription(contractAddress: string): Promise<{ txid: string }> {
    return post<{ txid: string }>("/subscription/claim", { contractAddress });
  },

  /** Cancel a subscription. POST /subscription/cancel */
  cancelSubscription(contractAddress: string): Promise<{ txid: string }> {
    return post<{ txid: string }>("/subscription/cancel", { contractAddress });
  },

  // ─── Subscription covenant flow ────────────────────────────────────────────

  /**
   * Server generates a fresh subscriber keypair + deploys the on-chain covenant.
   * Returns address to fund + subscriber WIF so auto-fund can sign the genesis tx.
   * POST /subscription/create-session
   */
  createSession(): Promise<{
    subscriberAddress: string;
    subscriberWif: string;
    contractAddress: string;
    tokenAddress: string;
    genesisCommitment: string;
    depositSats: number;
    authorizedSats: number;
    intervalBlocks: number;
    startBlock: number;
    hint: string;
  }> {
    return post(/* path */ "/subscription/create-session", {});
  },

  /**
   * Build + broadcast the genesis funding tx server-side, then activate.
   * POST /subscription/auto-fund
   */
  autoFund(params: { contractAddress: string; subscriberWif: string }): Promise<{
    message: string;
    txid: string;
    tokenCategory: string;
    contractAddress: string;
    depositSats: string;
    authorizedSats: string;
    intervalBlocks: number;
  }> {
    return post("/subscription/auto-fund", params);
  },

  /**
   * Verify subscription token and get an access JWT.
   * GET /subscription/verify?tokenCategory=…
   */
  verifySubscription(tokenCategory: string): Promise<{ accessToken: string; expiresInSeconds: number }> {
    return get(`/subscription/verify?tokenCategory=${encodeURIComponent(tokenCategory)}`);
  },

  /**
   * Call the subscription-gated Router402 data endpoint.
   * Deducts perCallSats from the subscriber's contract balance server-side.
   * GET /api/subscription/data   X-Subscription-Token: <tokenCategory>
   */
  subscriptionData(tokenCategory: string): Promise<{
    message: string;
    flow: { step3: string; step4: string };
    context: {
      requestId: string;
      tokenCategory: string;
      contractAddress: string;
      costSats: number;
      remainingBalance: string;
      pendingSats: string;
    };
    data: { price: { BCH: number; USD: number }; block: string; network: string; hint: string };
  }> {
    return get("/api/subscription/data", { "X-Subscription-Token": tokenCategory });
  },

  /**
   * Fetch merchant dashboard (plans, subscriptions, pending earnings, usage).
   * GET /merchant/dashboard
   */
  merchantDashboard(): Promise<{
    summary: {
      totalPlans: number;
      activePlans: number;
      activeSubscriptions: number;
      pendingSubscriptions: number;
      totalContractBalance: string;
      totalPendingEarnings: string;
      claimableSubscriptions: number;
    };
    plans: Array<{ planId: string; name: string; perCallSats: number; subscriberCount: number; status: string }>;
    subscriptions: Array<{ contractAddress: string; tokenCategory: string; status: string; balance: string; pendingUsage: string }>;
    usage: Array<{ tokenCategory: string; pendingSats: string; totalSats: string; recentCallCount: number; lastUsedAt: string }>;
  }> {
    return get("/merchant/dashboard");
  },

  /**
   * Trigger on-chain claim for all active subscriptions.
   * POST /merchant/claim-all
   */
  merchantClaimAll(): Promise<{
    message: string;
    totalClaimedSats: string;
    results: Array<{ contractAddress: string; tokenCategory: string; status: string; txid?: string; claimedSats?: string; error?: string }>;
  }> {
    return post("/merchant/claim-all", {});
  },

  // ─── Raw fetch utilities ──────────────────────────────────────────────────

  raw(method: string, path: string): Promise<Response> {
    return fetch(`${BASE}${path}`, { method });
  },

  rawWithToken(method: string, path: string, token: string): Promise<Response> {
    return fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  rawWithSubToken(method: string, path: string, tokenCategory: string): Promise<Response> {
    return fetch(`${BASE}${path}`, {
      method,
      headers: { "X-Subscription-Token": tokenCategory },
    });
  },
};

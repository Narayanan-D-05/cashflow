/**
 * src/utils/bip21.ts
 * BIP-21 payment URI builder for BCH per-call and subscription payments.
 *
 * BIP-21 format:
 *   bitcoincash:<address>?amount=<BCH>&label=<label>&message=<message>
 *
 * For CashToken-gated access, we extend with:
 *   bitcoincash:<address>?amount=<BCH>&c=<tokenCategory>&label=<label>
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Bip21Params {
  /** Recipient BCH address */
  address: string;
  /** Amount in satoshis (will be converted to BCH for the URI) */
  amountSats: number;
  /** Optional human-readable label */
  label?: string;
  /** Optional message */
  message?: string;
  /** Optional CashToken category (hex) — for token-gated payments */
  tokenCategory?: string;
  /** Optional arbitrary extra query params */
  extras?: Record<string, string>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SATS_PER_BCH = 100_000_000;

/**
 * Convert satoshis to BCH with up to 8 decimal places.
 */
function satsToBch(sats: number): string {
  return (sats / SATS_PER_BCH).toFixed(8);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a BIP-21 BCH payment URI.
 *
 * @example
 * buildPaymentUri({ address: 'bitcoincash:q...', amountSats: 100 })
 * // → 'bitcoincash:bitcoincash:q...?amount=0.00000100'
 */
export function buildPaymentUri(params: Bip21Params): string {
  const { address, amountSats, label, message, tokenCategory, extras } = params;

  const query = new URLSearchParams();
  query.set('amount', satsToBch(amountSats));

  if (label)         query.set('label',   label);
  if (message)       query.set('message', message);
  if (tokenCategory) query.set('c',       tokenCategory);

  if (extras) {
    for (const [k, v] of Object.entries(extras)) {
      query.set(k, v);
    }
  }

  // Strip the "bitcoincash:" prefix from address if already present
  const rawAddress = address.startsWith('bitcoincash:')
    ? address.slice('bitcoincash:'.length)
    : address.startsWith('bchtest:')
    ? address.slice('bchtest:'.length)
    : address;

  // Re-use the original prefix from the full address string
  const prefix = address.includes(':') ? address.split(':')[0] : 'bitcoincash';

  return `${prefix}:${rawAddress}?${query.toString()}`;
}

/**
 * Build a per-call payment URI for the HTTP-402 challenge.
 */
export function buildPerCallUri(opts: {
  merchantAddress: string;
  amountSats: number;
  nonce: string;
  apiPath: string;
}): string {
  return buildPaymentUri({
    address:   opts.merchantAddress,
    amountSats: opts.amountSats,
    label:     `API-Access`,
    message:   `Pay for ${opts.apiPath}`,
    extras:    { nonce: opts.nonce },
  });
}

/**
 * Build a subscription funding URI.
 * The client should send the specified amount to the contract's token address.
 */
export function buildSubscriptionFundingUri(opts: {
  contractTokenAddress: string;
  depositSats: number;
  tokenCategory: string;
}): string {
  return buildPaymentUri({
    address:       opts.contractTokenAddress,
    amountSats:    opts.depositSats,
    label:         'Subscription-Funding',
    tokenCategory: opts.tokenCategory,
  });
}

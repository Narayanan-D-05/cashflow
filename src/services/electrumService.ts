/**
 * src/services/electrumService.ts
 * Singleton Electrum connection for ChipNet (BCH testnet).
 *
 * Provides:
 *   - Raw transaction lookup (by txid)
 *   - Address history / UTXO queries
 *   - Address-change subscription for mempool monitoring
 *   - Current block height
 */

import { ElectrumClient, ElectrumClientEvents } from '@electrum-cash/network';
import { ElectrumWebSocket } from '@electrum-cash/web-socket';
import { addressToElectrumScripthash } from '../utils/crypto.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ElectrumTxOutput {
  scriptpubkey: string;
  value: number;          // in satoshis
}

export interface ElectrumRawTx {
  txid: string;
  hex: string;
  vout: Array<{ value: number; scriptpubkey: string; n: number }>;
  confirmations?: number;
  blockhash?: string;
  blocktime?: number;
}

export interface AddressHistoryItem {
  tx_hash: string;
  height: number;
}

export type AddressChangeCallback = (scripthash: string, status: string) => void;

// ─── Singleton ────────────────────────────────────────────────────────────────

let client: ElectrumClient<ElectrumClientEvents> | null = null;

/** Map from scripthash → Set of callbacks to call on change */
const changeCallbacks = new Map<string, Set<AddressChangeCallback>>();

/**
 * Connect to the Electrum server (if not already connected).
 * Uses ELECTRUM_HOST / ELECTRUM_PORT / ELECTRUM_PROTOCOL from env.
 */
export async function connectElectrum(): Promise<ElectrumClient<ElectrumClientEvents>> {
  if (client) return client;

  const host     = process.env['ELECTRUM_HOST']     ?? 'chipnet.imaginary.cash';
  const protocol = process.env['ELECTRUM_PROTOCOL'] ?? 'wss';
  const port     = parseInt(process.env['ELECTRUM_PORT'] ?? '50004', 10);

  // @electrum-cash/network v4: pass a pre-built ElectrumWebSocket so we control host/port/SSL.
  // Passing a full URL string causes the library to treat it as a hostname and double-append the port.
  const encrypted = protocol === 'wss';
  const socket = new ElectrumWebSocket(host, port, encrypted);
  client = new ElectrumClient<ElectrumClientEvents>('CashFlow402', '1.5.1', socket);

  // Wire up notification handler for address subscriptions
  client.on('notification', (notification: unknown) => {
    const n = notification as { method?: string; params?: unknown[] };
    if (n.method === 'blockchain.scripthash.subscribe' && Array.isArray(n.params)) {
      const [scripthash, status] = n.params as [string, string];
      const cbs = changeCallbacks.get(scripthash);
      if (cbs) {
        for (const cb of cbs) cb(scripthash, status);
      }
    }
  });

  await client.connect();
  console.log(`[Electrum] Connected to ${host}:${port} (${protocol.toUpperCase()})`);
  return client;
}

/**
 * Disconnect from the Electrum server and reset the singleton.
 */
export async function disconnectElectrum(): Promise<void> {
  if (client) {
    await client.disconnect();
    client = null;
    console.log('[Electrum] Disconnected.');
  }
}

// ─── Request helpers ──────────────────────────────────────────────────────────

/**
 * Fetch a raw transaction (verbose) by txid.
 * Returns null if the transaction is not found.
 */
export async function getRawTransaction(txid: string): Promise<ElectrumRawTx | null> {
  const c = await connectElectrum();
  const result = await c.request('blockchain.transaction.get', txid, true);
  if (result instanceof Error || !result) return null;
  return result as unknown as ElectrumRawTx;
}

/**
 * Get transaction history for a BCH address.
 */
export async function getAddressHistory(address: string): Promise<AddressHistoryItem[]> {
  const c = await connectElectrum();
  const scripthash = addressToElectrumScripthash(address);
  const result = await c.request('blockchain.scripthash.get_history', scripthash);
  if (result instanceof Error) return [];
  return result as unknown as AddressHistoryItem[];
}

/**
 * Get current BCH block height.
 */
export async function getBlockHeight(): Promise<number> {
  const c = await connectElectrum();
  const result = await c.request('blockchain.headers.subscribe');
  if (result instanceof Error) {
    throw new Error(`Failed to get block height: ${result.message}`);
  }
  const header = result as unknown as { height: number };
  return header.height;
}

/**
 * Get the raw hex of a transaction.
 */
export async function getRawTransactionHex(txid: string): Promise<string | null> {
  const c = await connectElectrum();
  const result = await c.request('blockchain.transaction.get', txid, false);
  if (result instanceof Error || typeof result !== 'string') return null;
  return result;
}

// ─── Subscription API ─────────────────────────────────────────────────────────

/**
 * Subscribe to address changes via Electrum scripthash subscription.
 * `callback` is called whenever a transaction affecting `address` is broadcast or confirmed.
 *
 * Multiple callbacks can be registered for the same address.
 */
export async function subscribeToAddress(
  address: string,
  callback: AddressChangeCallback,
): Promise<void> {
  const c = await connectElectrum();
  const scripthash = addressToElectrumScripthash(address);

  // Register the callback locally
  if (!changeCallbacks.has(scripthash)) {
    changeCallbacks.set(scripthash, new Set());
    // First subscriber for this scripthash — register with Electrum
    await c.subscribe('blockchain.scripthash.subscribe', scripthash);
  }

  changeCallbacks.get(scripthash)!.add(callback);
  console.log(`[Electrum] Subscribed to address changes for ${address.slice(0, 20)}…`);
}

/**
 * Unsubscribe a callback from address notifications.
 */
export function unsubscribeFromAddress(address: string, callback: AddressChangeCallback): void {
  const scripthash = addressToElectrumScripthash(address);
  const cbs = changeCallbacks.get(scripthash);
  if (cbs) {
    cbs.delete(callback);
    if (cbs.size === 0) changeCallbacks.delete(scripthash);
  }
}

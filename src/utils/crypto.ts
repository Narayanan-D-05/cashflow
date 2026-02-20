/**
 * src/utils/crypto.ts
 * BCH key and address helpers using @bitauth/libauth.
 *
 * All functions are synchronous — libauth secp256k1 is pre-instantiated
 * at module load time (the singleton is already included in the library).
 */

import {
  secp256k1,
  hash160,
  encodeCashAddress,
  decodeCashAddress,
  cashAddressToLockingBytecode,
  generatePrivateKey,
  encodePrivateKeyWif,
  decodePrivateKeyWif,
  CashAddressNetworkPrefix,
  CashAddressType,
} from '@bitauth/libauth';
import crypto from 'node:crypto';
import { Network } from 'cashscript';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  pkh: Uint8Array;        // 20-byte P2PKH hash
  address: string;        // CashAddress string (e.g. bchtest:q…)
  wif: string;
}

// ─── Network helpers ──────────────────────────────────────────────────────────

/** Map CashScript network string → libauth CashAddressNetworkPrefix */
function networkPrefix(network: string): CashAddressNetworkPrefix {
  if (network === Network.MAINNET) return CashAddressNetworkPrefix.mainnet;
  // chipnet, testnet3, testnet4 all use bchtest prefix
  return CashAddressNetworkPrefix.testnet;
}

/** Map CashScript network string → libauth WIF network string */
function wifNetwork(network: string): 'mainnet' | 'testnet' {
  return network === Network.MAINNET ? 'mainnet' : 'testnet';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a fresh random BCH key pair for the given network.
 */
export function generateKeyPair(network: string = Network.CHIPNET): KeyPair {
  const privateKey = generatePrivateKey(() => crypto.getRandomValues(new Uint8Array(32)));
  return privKeyToKeyPair(privateKey, network);
}

/**
 * Build a full KeyPair from a raw 32-byte private key.
 */
export function privKeyToKeyPair(privateKey: Uint8Array, network: string = Network.CHIPNET): KeyPair {
  const pubKeyResult = secp256k1.derivePublicKeyCompressed(privateKey);
  const publicKey = pubKeyResult instanceof Uint8Array ? pubKeyResult : (() => { throw new Error('Failed to derive public key: ' + String(pubKeyResult)); })();
  const pkhResult = hash160(publicKey);
  const pkh = pkhResult instanceof Uint8Array ? pkhResult : (() => { throw new Error('hash160 failed: ' + String(pkhResult)); })();
  const addrResult = encodeCashAddress({
    prefix:  networkPrefix(network),
    type:    CashAddressType.p2pkh,
    payload: pkh,
  });
  if (typeof addrResult === 'string') throw new Error(`encodeCashAddress failed: ${addrResult}`);
  const address = addrResult.address;
  const wifResult = encodePrivateKeyWif(privateKey, wifNetwork(network));
  const wif = typeof wifResult === 'string' && !wifResult.startsWith('Error') ? wifResult : (() => { throw new Error('WIF encoding failed: ' + String(wifResult)); })();

  return { privateKey, publicKey, pkh, address, wif };
}

/**
 * Decode a WIF private key string and return the full KeyPair.
 * Throws on invalid WIF.
 */
export function wifToKeyPair(wif: string, network: string = Network.CHIPNET): KeyPair {
  const result = decodePrivateKeyWif(wif);
  if (typeof result === 'string') {
    throw new Error(`Invalid WIF private key: ${result}`);
  }
  return privKeyToKeyPair(result.privateKey, network);
}

/**
 * Return the 20-byte P2PKH hash for a BCH address.
 * Throws if the address cannot be decoded.
 */
export function addressToPkh(address: string): Uint8Array {
  const decoded = decodeCashAddress(address);
  if (typeof decoded === 'string') {
    throw new Error(`Invalid CashAddress: ${decoded}`);
  }
  return decoded.payload;
}

/**
 * Convert a BCH address to the Electrum scripthash format:
 *   SHA256(lockingBytecode).reverse().hex()
 * Used for address-based Electrum subscriptions.
 */
export function addressToElectrumScripthash(address: string): string {
  const lockResult = cashAddressToLockingBytecode(address);
  if (typeof lockResult === 'string') {
    throw new Error(`Cannot derive locking bytecode for address: ${lockResult}`);
  }
  const hashBytes = crypto.createHash('sha256').update(lockResult.bytecode).digest();
  // Electrum requires little-endian (reversed) hex
  return Buffer.from(hashBytes).reverse().toString('hex');
}

/**
 * Encode a 32-bit signed integer as 4-byte little-endian Uint8Array.
 * Used to construct NFT commitment fields.
 */
export function int32ToLeBytes(n: number): Uint8Array {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(n, 0);
  return new Uint8Array(buf);
}

/**
 * Decode a 4-byte little-endian Uint8Array as a 32-bit signed integer.
 */
export function leBytesToInt32(bytes: Uint8Array): number {
  return Buffer.from(bytes).readInt32LE(0);
}

/**
 * Build the 8-byte mutable NFT commitment for an AutoPaySubscription contract.
 *   [0..3]  lastClaimBlock  (int32 LE)
 *   [4..7]  authorizedSats  (int32 LE)
 */
export function buildNftCommitment(lastClaimBlock: number, authorizedSats: number): string {
  const part1 = int32ToLeBytes(lastClaimBlock);
  const part2 = int32ToLeBytes(authorizedSats);
  const combined = new Uint8Array(8);
  combined.set(part1, 0);
  combined.set(part2, 4);
  return Buffer.from(combined).toString('hex');
}

/**
 * Parse the 8-byte NFT commitment hex string.
 * Returns { lastClaimBlock, authorizedSats }.
 */
export function parseNftCommitment(commitmentHex: string): {
  lastClaimBlock: number;
  authorizedSats: number;
} {
  const buf = Buffer.from(commitmentHex, 'hex');
  if (buf.length !== 8) {
    throw new Error(`NFT commitment must be 8 bytes, got ${buf.length}`);
  }
  return {
    lastClaimBlock: buf.readInt32LE(0),
    authorizedSats: buf.readInt32LE(4),
  };
}

/**
 * Convert a Uint8Array to a hex string.
 */
export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

/**
 * Convert a hex string to a Uint8Array.
 */
export function fromHex(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

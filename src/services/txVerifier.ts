/**
 * src/services/txVerifier.ts
 * Verifies BCH payments on-chain using the Electrum connection.
 *
 * Two verification paths:
 *   1. Per-call: confirm a payment of ≥ requiredSats reached the merchant address.
 *   2. Subscription funding: confirm BCH + mutable NFT arrived at the contract address.
 */

import { getRawTransaction } from './electrumService.js';
import { cashAddressToLockingBytecode } from '@bitauth/libauth';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VerifyPerCallResult {
  verified: boolean;
  amountSats: number;
  error?: string;
}

export interface VerifySubscriptionFundingResult {
  verified: boolean;
  amountSats: number;
  tokenCategory?: string;
  commitment?: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a CashAddress to its locking bytecode hex string.
 * Used to match against raw transaction outputs.
 */
function addressToLockBytecodeHex(address: string): string {
  const result = cashAddressToLockingBytecode(address);
  if (typeof result === 'string') {
    throw new Error(`Cannot convert address to locking bytecode: ${result}`);
  }
  return Buffer.from(result.bytecode).toString('hex');
}

// ─── Per-Call Verification ────────────────────────────────────────────────────

/**
 * Verify that a BCH transaction (identified by txid) contains an output paying
 * at least `requiredSats` to `merchantAddress`.
 *
 * This is the core check for HTTP-402 per-call billing:
 *   1. Fetch the raw verbose transaction from Electrum.
 *   2. Scan outputs for a matching locking bytecode.
 *   3. Confirm the output value meets the minimum.
 *
 * Note: For the MVP we check mempool inclusion (0-conf). Production should
 * add a `minConfirmations` parameter.
 */
export async function verifyPerCallPayment(opts: {
  txid: string;
  merchantAddress: string;
  requiredSats: number;
}): Promise<VerifyPerCallResult> {
  const { txid, merchantAddress, requiredSats } = opts;

  const tx = await getRawTransaction(txid);
  if (!tx) {
    return { verified: false, amountSats: 0, error: 'Transaction not found in mempool or chain.' };
  }

  let expectedLockBytecode: string;
  try {
    expectedLockBytecode = addressToLockBytecodeHex(merchantAddress);
  } catch (e) {
    return { verified: false, amountSats: 0, error: `Bad merchant address: ${String(e)}` };
  }

  // Scan all outputs for a matching payment to the merchant
  for (const out of tx.vout) {
    if (out.scriptpubkey === expectedLockBytecode) {
      // Electrum verbose tx returns output values in BCH (float)
      const receivedSats = Math.round(out.value * 100_000_000);
      if (receivedSats >= requiredSats) {
        return { verified: true, amountSats: receivedSats };
      } else {
        return {
          verified: false,
          amountSats: receivedSats,
          error: `Payment of ${receivedSats} sats is less than required ${requiredSats} sats.`,
        };
      }
    }
  }

  return {
    verified: false,
    amountSats: 0,
    error: `No output found paying to merchant address ${merchantAddress.slice(0, 20)}…`,
  };
}

// ─── Subscription Funding Verification ───────────────────────────────────────

/**
 * Verify that a subscription contract has been funded:
 *   - A UTXO at `contractTokenAddress` with ≥ `minFundingSats`
 *   - That UTXO carries a mutable NFT matching `expectedTokenCategory`
 *
 * Electrum verbose transactions include a `token_data` field for CashToken outputs.
 * Structure (Fulcrum/ChipNet):
 *   {
 *     category: "<32 byte hex>",
 *     nft: { capability: "mutable", commitment: "<hex>" } // optional
 *     amount: "<bigint string>"                           // FT amount, optional
 *   }
 */
export async function verifySubscriptionFunding(opts: {
  txid: string;
  contractTokenAddress: string;
  expectedTokenCategory: string;
  minFundingSats: number;
}): Promise<VerifySubscriptionFundingResult> {
  const { txid, contractTokenAddress, expectedTokenCategory, minFundingSats } = opts;

  const tx = await getRawTransaction(txid);
  if (!tx) {
    return { verified: false, amountSats: 0, error: 'Funding transaction not found.' };
  }

  let expectedLock: string;
  try {
    expectedLock = addressToLockBytecodeHex(contractTokenAddress);
  } catch (e) {
    return { verified: false, amountSats: 0, error: `Bad contract address: ${String(e)}` };
  }

  for (const out of tx.vout as Array<{
    value: number;
    scriptpubkey: string;
    n: number;
    token_data?: {
      category: string;
      nft?: { capability: string; commitment: string };
      amount?: string;
    };
  }>) {
    if (out.scriptpubkey !== expectedLock) continue;

    const receivedSats = Math.round(out.value * 100_000_000);

    if (!out.token_data) {
      return {
        verified: false,
        amountSats: receivedSats,
        error: 'Output to contract has no CashToken data. Subscription NFT not found.',
      };
    }

    const cat = out.token_data.category;
    if (cat.toLowerCase() !== expectedTokenCategory.toLowerCase()) {
      return {
        verified: false,
        amountSats: receivedSats,
        error: `Token category mismatch. Expected ${expectedTokenCategory}, got ${cat}.`,
      };
    }

    if (!out.token_data.nft || out.token_data.nft.capability !== 'mutable') {
      return {
        verified: false,
        amountSats: receivedSats,
        error: 'Output NFT is not mutable — invalid subscription token.',
      };
    }

    if (receivedSats < minFundingSats) {
      return {
        verified: false,
        amountSats: receivedSats,
        error: `Funding of ${receivedSats} sats is less than required ${minFundingSats} sats.`,
      };
    }

    return {
      verified:      true,
      amountSats:    receivedSats,
      tokenCategory: cat,
      commitment:    out.token_data.nft.commitment,
    };
  }

  return {
    verified: false,
    amountSats: 0,
    error: `No output found at contract address ${contractTokenAddress.slice(0, 20)}…`,
  };
}

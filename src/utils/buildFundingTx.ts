/**
 * src/utils/buildFundingTx.ts
 * Builds and broadcasts a CashToken genesis funding transaction for a
 * subscription contract, without requiring a CashTokens-aware external wallet.
 *
 * Transaction structure:
 *   Input  [0]: subscriber P2PKH UTXO  (its txid = tokenCategory)
 *   Output [0]: contract tokenAddress  (depositSats + mutable NFT)
 *   Output [1]: subscriber P2PKH       (change, if any)
 */

import { createHash } from 'node:crypto';
import { secp256k1, cashAddressToLockingBytecode } from '@bitauth/libauth';
import type { ElectrumNetworkProvider } from 'cashscript';

// ─── Low-level helpers ────────────────────────────────────────────────────────

function sha256(data: Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}

function hash256(data: Buffer): Buffer {
  return sha256(sha256(data));
}

function encodeVarInt(n: number): Buffer {
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) {
    const b = Buffer.alloc(3); b[0] = 0xfd; b.writeUInt16LE(n, 1); return b;
  }
  const b = Buffer.alloc(5); b[0] = 0xfe; b.writeUInt32LE(n, 1); return b;
}

function encodeUInt64LE(n: bigint): Buffer {
  const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b;
}

function encodeUInt32LE(n: number): Buffer {
  const b = Buffer.alloc(4); b.writeUInt32LE(n); return b;
}

// ─── Token prefix encoder (CHIP-2022-02-CashTokens) ──────────────────────────

/**
 * Encode a mutable NFT token prefix.
 * Bitfield: HAS_NFT(0x02) | MUTABLE(0x20) | [HAS_COMMITMENT(0x40)]
 * Verified against the CashTokens test vectors (mutable + commitment = 0x62).
 *
 * categoryHex: display-order (big-endian) txid hex string
 * commitment : raw commitment bytes
 */
export function encodeMutableNftPrefix(categoryHex: string, commitment: Buffer): Buffer {
  const categoryLE = Buffer.from(categoryHex, 'hex').reverse(); // 32 bytes LE
  const hasCommitment = commitment.length > 0;
  // 0x02 = HAS_NFT, 0x10 = MUTABLE, 0x40 = HAS_COMMITMENT_LENGTH
  const bitfield = 0x02 | 0x10 | (hasCommitment ? 0x40 : 0x00);

  const parts: Buffer[] = [
    Buffer.from([0xef]),   // PREFIX_TOKEN magic
    categoryLE,
    Buffer.from([bitfield]),
  ];

  if (hasCommitment) {
    parts.push(encodeVarInt(commitment.length));
    parts.push(commitment);
  }

  return Buffer.concat(parts);
}

// ─── Script helpers ──────────────────────────────────────────────────────────

/** Build a P2PKH locking script: OP_DUP OP_HASH160 <pkh> OP_EQUALVERIFY OP_CHECKSIG */
function p2pkhScript(pkh: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([0x76, 0xa9, 0x14]),
    pkh,
    Buffer.from([0x88, 0xac]),
  ]);
}

/** Convert any CashAddress (P2PKH or P2SH) to its locking bytecode. */
function addressToLockBytecode(address: string): Buffer {
  const result = cashAddressToLockingBytecode(address);
  if (typeof result === 'string') throw new Error(`Bad address "${address}": ${result}`);
  return Buffer.from(result.bytecode);
}

// ─── BIP143 BCH sighash (SIGHASH_ALL | SIGHASH_FORKID = 0x41) ─────────────────

interface InputInfo { txid: string; vout: number; value: bigint; sequence: number }
interface OutputInfo { lockBytecode: Buffer; value: bigint; tokenPrefix?: Buffer }

function computeBCHSighash(
  version: number,
  inputs: InputInfo[],
  outputs: OutputInfo[],
  inputIndex: number,
  scriptCode: Buffer,   // P2PKH script of the input being signed
  locktime: number,
  sighashType: number,
): Buffer {
  const inp = inputs[inputIndex]!;

  const hashPrevouts = hash256(Buffer.concat(
    inputs.map(i => Buffer.concat([Buffer.from(i.txid, 'hex').reverse(), encodeUInt32LE(i.vout)])),
  ));

  const hashSequence = hash256(Buffer.concat(inputs.map(i => encodeUInt32LE(i.sequence))));

  const outpoint = Buffer.concat([Buffer.from(inp.txid, 'hex').reverse(), encodeUInt32LE(inp.vout)]);

  // Each output includes token prefix IF present (for hashOutputs)
  const hashOutputs = hash256(Buffer.concat(outputs.map(o => {
    const fullScript = o.tokenPrefix ? Buffer.concat([o.tokenPrefix, o.lockBytecode]) : o.lockBytecode;
    return Buffer.concat([encodeUInt64LE(o.value), encodeVarInt(fullScript.length), fullScript]);
  })));

  const preimage = Buffer.concat([
    encodeUInt32LE(version),
    hashPrevouts,
    hashSequence,
    outpoint,
    encodeVarInt(scriptCode.length), scriptCode,
    encodeUInt64LE(inp.value),
    encodeUInt32LE(inp.sequence),
    hashOutputs,
    encodeUInt32LE(locktime),
    encodeUInt32LE(sighashType),
  ]);

  return hash256(preimage);
}

// ─── Transaction encoder ──────────────────────────────────────────────────────

interface SignedInput { txid: string; vout: number; unlockingScript: Buffer; sequence: number }

function encodeTx(
  version: number,
  inputs: SignedInput[],
  outputs: OutputInfo[],
  locktime: number,
): Buffer {
  const ins = Buffer.concat(inputs.map(i => Buffer.concat([
    Buffer.from(i.txid, 'hex').reverse(),
    encodeUInt32LE(i.vout),
    encodeVarInt(i.unlockingScript.length),
    i.unlockingScript,
    encodeUInt32LE(i.sequence),
  ])));

  const outs = Buffer.concat(outputs.map(o => {
    const fullScript = o.tokenPrefix ? Buffer.concat([o.tokenPrefix, o.lockBytecode]) : o.lockBytecode;
    return Buffer.concat([encodeUInt64LE(o.value), encodeVarInt(fullScript.length), fullScript]);
  }));

  return Buffer.concat([
    encodeUInt32LE(version),
    encodeVarInt(inputs.length), ins,
    encodeVarInt(outputs.length), outs,
    encodeUInt32LE(locktime),
  ]);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build and broadcast a CashToken genesis funding transaction.
 *
 * This creates a mutable NFT at the contract's token address, funding
 * the subscription covenant so it can be activated.
 *
 * @returns txid and tokenCategory (= txid of the spent outpoint)
 */
export async function buildAndBroadcastGenesisFundingTx(opts: {
  subscriberPrivKey: Uint8Array;
  subscriberPubKey: Uint8Array;
  subscriberPkh: Buffer;
  subscriberAddress: string;
  contractTokenAddress: string;
  genesisCommitment: string;  // hex
  depositSats: bigint;
  provider: ElectrumNetworkProvider;
}): Promise<{ txid: string; tokenCategory: string }> {
  const {
    subscriberPrivKey, subscriberPubKey,
    subscriberPkh, subscriberAddress,
    contractTokenAddress, genesisCommitment,
    depositSats, provider,
  } = opts;

  // 1. Fetch subscriber UTXOs, pick first non-token one
  const utxos = await provider.getUtxos(subscriberAddress);
  const genesisUtxo = utxos.find(u => !u.token);
  if (!genesisUtxo) {
    throw new Error(
      `No spendable (non-token) UTXOs at ${subscriberAddress}. ` +
      `Please fund this address with tBCH from https://tbch.googol.cash`,
    );
  }

  const MINER_FEE = 1500n;
  const changeSats = genesisUtxo.satoshis - depositSats - MINER_FEE;
  if (changeSats < 0n) {
    throw new Error(
      `Insufficient balance: have ${genesisUtxo.satoshis} sats, ` +
      `need ${depositSats + MINER_FEE} sats (deposit + fee).`,
    );
  }

  // 2. tokenCategory = txid of the outpoint being spent (display-order hex)
  const tokenCategory = genesisUtxo.txid;

  // 3. Build outputs
  const contractLockBytecode = addressToLockBytecode(contractTokenAddress);
  const subscriberLockBytecode = addressToLockBytecode(subscriberAddress);
  const tokenPrefix = encodeMutableNftPrefix(tokenCategory, Buffer.from(genesisCommitment, 'hex'));

  const outputs: OutputInfo[] = [
    { lockBytecode: contractLockBytecode, value: depositSats, tokenPrefix },
    ...(changeSats >= 546n ? [{ lockBytecode: subscriberLockBytecode, value: changeSats }] : []),
  ];

  // 4. Compute BIP143 BCH sighash (SIGHASH_ALL | SIGHASH_FORKID = 0x41)
  const infoInputs: InputInfo[] = [{
    txid: genesisUtxo.txid,
    vout: genesisUtxo.vout,
    value: genesisUtxo.satoshis,
    sequence: 0xffffffff,
  }];

  const scriptCode = p2pkhScript(subscriberPkh);
  const SIGHASH_TYPE = 0x41; // SIGHASH_ALL | SIGHASH_FORKID
  const sighash = computeBCHSighash(2, infoInputs, outputs, 0, scriptCode, 0, SIGHASH_TYPE);

  // 5. Sign with Schnorr (BCH uses Schnorr since Nov 2019)
  const sigResult = secp256k1.signMessageHashSchnorr(subscriberPrivKey, sighash);
  if (typeof sigResult === 'string') throw new Error(`Schnorr signing failed: ${sigResult}`);

  const sigWithType = Buffer.concat([Buffer.from(sigResult), Buffer.from([SIGHASH_TYPE])]);

  // 6. Build P2PKH unlocking script: <push sig> <push pubkey>
  const unlockingScript = Buffer.concat([
    encodeVarInt(sigWithType.length),
    sigWithType,
    encodeVarInt(subscriberPubKey.length),
    Buffer.from(subscriberPubKey),
  ]);

  // 7. Encode and broadcast
  const signedInputs: SignedInput[] = [{
    txid: genesisUtxo.txid,
    vout: genesisUtxo.vout,
    unlockingScript,
    sequence: 0xffffffff,
  }];

  const rawHex = encodeTx(2, signedInputs, outputs, 0).toString('hex');

  const txid = await provider.sendRawTransaction(rawHex);
  return { txid, tokenCategory };
}

import { generatePrivateKey, encodePrivateKeyWif, secp256k1 } from '@bitauth/libauth';
import { randomBytes } from 'node:crypto';

// Use the same approach as crypto.ts which already works
const kp = (await import('./src/utils/crypto.js')).generateKeyPair('chipnet');
console.log('MERCHANT_WIF=' + kp.wif);
console.log('MERCHANT_ADDRESS=' + kp.address);

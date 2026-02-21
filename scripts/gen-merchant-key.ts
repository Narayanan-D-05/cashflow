import { generateKeyPair } from '../src/utils/crypto.js';

const kp = generateKeyPair('chipnet');
console.log(`MERCHANT_WIF=${kp.wif}`);
console.log(`MERCHANT_ADDRESS=${kp.address}`);

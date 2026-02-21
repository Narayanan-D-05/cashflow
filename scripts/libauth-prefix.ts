import { encodeTokenPrefix, binToHex } from '@bitauth/libauth';
const commit = new Uint8Array([0x12, 0x34]);
const cat = new Uint8Array(32);
const prefix = encodeTokenPrefix({
    token: {
        category: cat,
        nft: {
            capability: 'mutable',
            commitment: commit
        }
    }
});
console.log('Hex of prefix:', binToHex(prefix));

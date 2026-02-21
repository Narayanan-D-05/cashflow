import { binToHex } from '@bitauth/libauth';
const bitfield = 0x20 /* HAS_NFT */ | 0x01 /* MUTABLE */;
console.log(bitfield.toString(16));

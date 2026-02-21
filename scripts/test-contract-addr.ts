import { instantiateSubscriptionContract } from '../src/contracts/deploy.js';

const c = instantiateSubscriptionContract({
    merchantPkhHex: 'e9dd109df3b22d23de03fc374f955bb82c7ae161',
    subscriberPkhHex: 'a6ba9c9e32b31f8a62f9fe5cbcc5069145037395',
    intervalBlocks: 144
});

console.log('Contract Address:', c.contract.address);
console.log('Token Address:', c.contract.tokenAddress);

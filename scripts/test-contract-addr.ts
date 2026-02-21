import { instantiateSubscriptionContract } from '../src/contracts/deploy.js';

const c = instantiateSubscriptionContract({
    merchantPkhHex: 'e9dd109df3b22d23de03fc374f955bb82c7ae161',
    subscriberPkhHex: '9236bed98044d398e221221f89ebdfe4e1f3de8f',
    intervalBlocks: 1
});

console.log('Contract Address:', c.contract.address);
console.log('Token Address:', c.contract.tokenAddress);

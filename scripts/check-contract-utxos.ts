import { instantiateSubscriptionContract, getProvider } from '../src/contracts/deploy.js';
import { readFileSync } from 'fs';

async function run() {
    const data = JSON.parse(readFileSync('data/subscriptions.json', 'utf8'));
    const last = data[data.length - 1];

    console.log('Last Record Contract Address:', last.contractAddress);
    console.log('Last Record Token Category (DB):', last.tokenCategory);

    const c = instantiateSubscriptionContract({
        merchantPkhHex: last.merchantPkh,
        subscriberPkhHex: last.subscriberPkh,
        intervalBlocks: last.intervalBlocks
    });

    console.log('Computed Contract Address:', c.contract.address);
    console.log('Computed Token Address:', c.contract.tokenAddress);

    const provider = getProvider();

    const tutxos = await provider.getUtxos(c.contract.tokenAddress);
    console.log('Token Address UTXOs On-Chain:', tutxos.length);
    for (const u of tutxos) {
        if (u.token) {
            console.log('FOUND TOKEN CATEGORY ON-CHAIN:', u.token.category);
        }
    }

    // p.disconnect(); - not needed for standard HTTP provider if used
}
run();

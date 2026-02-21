import { ElectrumNetworkProvider, Contract } from 'cashscript';
import { bitauthToCashScript } from '../src/contracts/deploy.js';
import contractData from '../src/contracts/AutoPaySubscription.json' assert { type: 'json' };

async function check() {
    const p = new ElectrumNetworkProvider('chipnet');
    try {
        const c = new Contract(contractData, [new Uint8Array(20), new Uint8Array(20), 10n], { provider: p });
        console.log("Contract Address:", c.address);
        console.log("Token Address:", c.tokenAddress);

        // does c.getUtxos() fetch token utxos?
    } finally {
        p.disconnect();
    }
}
check();

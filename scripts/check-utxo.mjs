import { ElectrumNetworkProvider } from 'cashscript';

async function check() {
    const p = new ElectrumNetworkProvider('chipnet');
    try {
        const utxos = await p.getUtxos('bchtest:pwlcmmjpt55z3cwvf7jgk6gd6vnuucz7cs347pzdf800sd4cgjwvzurqx8jv8');
        console.log(JSON.stringify(utxos, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    } finally {
        p.disconnect();
    }
}
check();

import { ElectrumNetworkProvider } from 'cashscript';

async function run() {
    const p = new ElectrumNetworkProvider('chipnet');
    const contractAddr = 'bchtest:pdvly7qg2xhtlv9dl36vkd9nfqk85s5xemrpgqy2dt';

    // Actually we need the token address for pdvly7qg2xhtlv9dl36vkd9nfqk85s5xemrpgqy2dt
    // We can just use the address directly since CashScript providers getUtxos() 
    // can accept standard addresses or token addresses if we use libauth

    const utxos = await p.getUtxos(contractAddr);
    console.log('Contract Address UTXOs:', utxos.length);
    for (const u of utxos) {
        if (u.token) {
            console.log('FOUND TOKEN:', u.token.category);
        }
    }

    // we also need to get the token address UTXOs
    const tokenAddr = contractAddr.replace('p', 'r'); // quick hack to get p2sh32 token address
    const tutxos = await p.getUtxos(tokenAddr);
    console.log('Token Address UTXOs:', tutxos.length);
    for (const u of tutxos) {
        if (u.token) {
            console.log('FOUND TOKEN on token address:', u.token.category);
        }
    }

    p.disconnect();
}
run();

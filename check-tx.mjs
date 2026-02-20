import { cashAddressToLockingBytecode } from '@bitauth/libauth';
import { WebSocket } from '@monsterbitar/isomorphic-ws';
import crypto from 'crypto';

const addr = 'bchtest:qpumqqygwcnt999fz3gp5nxjy66ckg6esvmzshj478';
const result = cashAddressToLockingBytecode(addr);
const expectedHex = Buffer.from(result.bytecode).toString('hex');
console.log('Expected scriptPubKey hex:', expectedHex);

const lockBytes = Buffer.from(result.bytecode);
const sha256 = crypto.createHash('sha256').update(lockBytes).digest();
const scripthash = Buffer.from(sha256).reverse().toString('hex');
console.log('Scripthash:', scripthash);

const ws = new WebSocket('wss://chipnet.imaginary.cash:50004');
let step = 1;

ws.on('open', () => {
  ws.send(JSON.stringify({ jsonrpc:'2.0', id:1, method:'blockchain.scripthash.get_history', params:[scripthash] }));
});

ws.on('message', (data) => {
  const parsed = JSON.parse(data.toString());
  if (step === 1) {
    step = 2;
    const history = parsed.result;
    console.log('History:', JSON.stringify(history));
    if (!history || history.length === 0) { ws.close(); return; }
    const txid = history[history.length - 1].tx_hash;
    console.log('Fetching tx:', txid);
    ws.send(JSON.stringify({ jsonrpc:'2.0', id:2, method:'blockchain.transaction.get', params:[txid, true] }));
  } else if (step === 2) {
    if (parsed.result?.vout) {
      for (const out of parsed.result.vout) {
        console.log('VOUT:', JSON.stringify(out));
      }
    } else {
      console.log('TX Response:', JSON.stringify(parsed).slice(0, 500));
    }
    ws.close(); process.exit(0);
  }
});

ws.on('error', e => { console.log('ERROR:', e.message); process.exit(1); });
setTimeout(() => { ws.close(); process.exit(0); }, 10000);

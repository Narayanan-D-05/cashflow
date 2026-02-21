import http from 'http';

async function test() {
    try {
        const res1 = await fetch('http://localhost:3000/subscription/create-session', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
        const session = await res1.json();
        console.log("Session:", session.contractAddress);

        const res2 = await fetch('http://localhost:3000/subscription/auto-fund', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contractAddress: session.contractAddress,
                subscriberWif: session.subscriberWif
            })
        });
        const err = await res2.json();
        console.log("Error body:", err);
    } catch (e) {
        console.error(e);
    }
}
test();

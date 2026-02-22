const fs = require('fs');
let c = fs.readFileSync('frontend/app/merchant/page.tsx', 'utf-8');

// Add imports
const importIdx = c.indexOf('import { useState');
c = c.substring(0, importIdx) + 'import { useState, useEffect }' + c.substring(c.indexOf('}', importIdx) + 1);

// Add state & fetch logic
const hookIdx = c.indexOf('    const [contractAddress, setContractAddress]');
const fetchLogic = `    const [subscriptions, setSubscriptions] = useState<any[]>([]);
    const [subsLoading, setSubsLoading] = useState(false);

    const fetchSubscriptions = async () => {
        setSubsLoading(true);
        try {
            const res = await fetch(\`\${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/subscription/list\`);
            const data = await res.json();
            setSubscriptions(data.subscriptions || []);
        } catch(e) {
            console.error(e);
        } finally {
            setSubsLoading(false);
        }
    };

    useEffect(() => {
        fetchSubscriptions();
    }, []);

`;
c = c.substring(0, hookIdx) + fetchLogic + c.substring(hookIdx);

// Add the table UI
const renderIdx = c.indexOf('                </div>\n            </main>');
const tableUI = `
                    {/* Active Subscribers & Claims Table */}
                    <section className="mt-12">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-2xl font-bold font-[var(--font-space-grotesk)] text-gradient flex items-center gap-2"><Zap className="w-5 h-5 text-[var(--color-brand)]" /> Active Subscribers & Claims</h2>
                            <button onClick={fetchSubscriptions} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-white bg-[var(--color-surface-alt)] px-4 py-2 rounded-xl border border-[var(--glass-border)] hover:border-[var(--color-brand)]/40 transition-all font-semibold shadow-sm">
                                {subsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Refresh List"}
                            </button>
                        </div>
                        <div className="glass rounded-2xl border border-[var(--glass-border)] overflow-hidden shadow-lg">
                            {subsLoading && subscriptions.length === 0 ? (
                                <div className="p-12 flex flex-col items-center justify-center gap-3">
                                    <Loader2 className="w-8 h-8 animate-spin text-[var(--color-brand)]" />
                                    <p className="text-sm text-[var(--color-text-faint)]">Syncing with Cashflow store...</p>
                                </div>
                            ) : subscriptions.length === 0 ? (
                                <div className="p-12 text-center flex flex-col items-center justify-center gap-2">
                                    <Server className="w-8 h-8 text-[var(--color-text-faint)]/50" />
                                    <p className="text-[var(--color-text-faint)] text-sm">No subscriptions found on the network.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-[var(--color-surface-alt)]/50 text-[var(--color-text-faint)] text-[10px] uppercase tracking-widest border-b border-[var(--glass-border)] relative">
                                            <tr>
                                                <th className="px-6 py-4 font-semibold">Status</th>
                                                <th className="px-6 py-4 font-semibold">Subscription NFT ID</th>
                                                <th className="px-6 py-4 font-semibold text-right">Current Balance</th>
                                                <th className="px-6 py-4 font-semibold text-right">Max Authorized</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--glass-border)]">
                                            {subscriptions.map((sub, i) => (
                                                <tr key={i} className="hover:bg-[var(--color-surface-alt)]/40 hover:glass transition-colors group">
                                                    <td className="px-6 py-5">
                                                        <span className={\`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider \${
                                                            sub.status === 'active' ? 'bg-green-500/10 text-green-400 border border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]' : 
                                                            sub.status === 'cancelled' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                                            'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                                                        }\`}>
                                                            {sub.status === 'active' ? <CheckCircle2 className="w-3.5 h-3.5"/> : <AlertTriangle className="w-3.5 h-3.5" />}
                                                            {sub.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <div className="flex items-center gap-2">
                                                            <code className="px-2.5 py-1 rounded bg-[var(--color-bg)] border border-[var(--glass-border)] font-mono text-[11px] text-[var(--color-text-muted)]">
                                                                {sub.tokenCategory.substring(0, 20)}...
                                                            </code>
                                                            <CopyBtn value={sub.tokenCategory} />
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1.5">
                                                            <span className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wider">Address:</span>
                                                            <code className="text-[10px] font-mono text-[var(--color-text-faint)] truncate max-w-[120px]" title={sub.contractAddress}>
                                                                {sub.contractAddress.substring(0, 15)}...
                                                            </code>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-5 text-right">
                                                        <span className="font-bold font-mono text-[var(--color-success)] text-base">{Number(sub.balance).toLocaleString()}</span>
                                                        <span className="text-[10px] uppercase font-bold text-[var(--color-success)]/60 ml-1.5">sats</span>
                                                    </td>
                                                    <td className="px-6 py-5 text-right">
                                                        <span className="text-[var(--color-text-muted)] font-mono">{Number(sub.authorizedSats).toLocaleString()}</span>
                                                        <span className="text-[10px] uppercase font-bold text-[var(--color-text-faint)] ml-1.5">sats</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </section>
`;

c = c.substring(0, renderIdx) + tableUI + c.substring(renderIdx);
fs.writeFileSync('frontend/app/merchant/page.tsx', c);
console.log('Success merchant UI replaced!');

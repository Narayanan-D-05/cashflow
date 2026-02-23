"use client";

import { useState, useEffect } from "react";
import Header from "@/components/header";
import Footer from "@/components/footer";
import CursorGlow from "@/components/cursor-glow";
import { api } from "@/lib/api";
import {
    CheckCircle2,
    Loader2,
    AlertTriangle,
    Copy,
    Check,
    TrendingUp,
    Coins,
    Server,
    Zap
} from "lucide-react";

// Helper components
function CopyBtn({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);
    function copy() {
        navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }
    return (
        <button
            onClick={copy}
            className="shrink-0 p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] hover:text-[var(--color-brand)] transition-all"
            title="Copy"
        >
            {copied
                ? <Check className="w-3.5 h-3.5 text-[var(--color-success)]" />
                : <Copy className="w-3.5 h-3.5" />}
        </button>
    );
}

function MonoRow({ label, value, dimValue }: { label: string; value: string; dimValue?: boolean }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-faint)]">{label}</span>
            <div className="flex items-center gap-1 bg-[var(--color-surface-alt)] rounded-xl px-3 py-2">
                <code className={`flex-1 text-xs font-mono break-all ${dimValue ? "text-[var(--color-text-muted)]" : "text-[var(--color-text)]"}`}>
                    {value}
                </code>
                <CopyBtn value={value} />
            </div>
        </div>
    );
}

export default function MerchantDashboard() {
    const [subscriptions, setSubscriptions] = useState<any[]>([]);
    const [subsLoading, setSubsLoading] = useState(false);

    const [walletBalance, setWalletBalance] = useState<string | null>(null);
    const [walletAddress, setWalletAddress] = useState<string | null>(null);

    const fetchSubscriptions = async () => {
        setSubsLoading(true);
        try {
            const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
            const [listRes, walletRes] = await Promise.all([
                fetch(`${apiBase}/subscription/list`),
                fetch(`${apiBase}/merchant/wallet-balance`)
            ]);

            const listData = await listRes.json();
            setSubscriptions(listData.subscriptions || []);

            if (walletRes.ok) {
                const walletData = await walletRes.json();
                setWalletBalance(walletData.balanceSats);
                setWalletAddress(walletData.address);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setSubsLoading(false);
        }
    };

    useEffect(() => {
        fetchSubscriptions();

        const urlParams = new URLSearchParams(window.location.search);
        const prefillContract = urlParams.get('contractAddress');
        const prefillToken = urlParams.get('tokenCategory');
        if (prefillContract) setContractAddress(prefillContract);
        if (prefillToken) setTokenCategory(prefillToken);
    }, []);

    const [contractAddress, setContractAddress] = useState("");
    const [tokenCategory, setTokenCategory] = useState("");
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [claimData, setClaimData] = useState<{ txid: string, claimedSats: string, newBalance: string } | null>(null);

    const [batchLoading, setBatchLoading] = useState(false);
    const [batchResult, setBatchResult] = useState<any>(null);

    const runClaim = async () => {
        if (!contractAddress || !tokenCategory) return;
        setLoading(true);
        setErrorMsg(null);
        setClaimData(null);

        try {
            const data = await api.claimSubscription(contractAddress, tokenCategory) as any;
            setClaimData(data);
        } catch (e) {
            setErrorMsg(String(e));
        } finally {
            setLoading(false);
        }
    };

    const runBatchClaim = async () => {
        setBatchLoading(true);
        setErrorMsg(null);
        setBatchResult(null);

        try {
            const data = await api.merchantClaimAll();
            setBatchResult(data);
        } catch (e) {
            setErrorMsg(String(e));
        } finally {
            setBatchLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen flex flex-col font-sans text-white bg-[var(--color-bg)]">
            <CursorGlow />
            <Header />

            <main className="flex-1 flex w-full max-w-4xl mx-auto px-4 md:px-8 pt-24 pb-16 gap-8 animate-fade-in-up">

                <div className="flex-1 space-y-10">
                    <section>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono font-bold uppercase tracking-widest text-[var(--color-brand)] bg-[var(--color-brand)]/10 border border-[var(--color-brand)]/20 rounded-full mb-4">
                            <Server className="w-3.5 h-3.5" /> Merchant Dashboard
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold font-[var(--font-space-grotesk)] text-gradient tracking-tight">
                            Claim Funds
                        </h1>
                        <p className="text-lg text-[var(--color-text-muted)] mt-2 leading-relaxed">
                            Trigger on-chain claims to pull earned BCH from your active subscription active smart contracts directly into your secure backend merchant wallet.
                        </p>

                        {walletBalance !== null && (
                            <div className="mt-6 inline-flex flex-col gap-1 p-5 rounded-xl border border-[var(--glass-border)] bg-[var(--color-surface-alt)]/30 backdrop-blur-md shadow-lg">
                                <p className="text-[10px] uppercase tracking-widest text-[var(--color-text-faint)]">Merchant Wallet Balance</p>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-bold font-mono text-[var(--color-success)] drop-shadow-[0_0_10px_rgba(34,197,94,0.3)]">{Number(walletBalance).toLocaleString()}</span>
                                    <span className="text-sm font-bold text-[var(--color-success)]/60">sats</span>
                                </div>
                                {walletAddress && <p className="text-[10px] font-mono text-[var(--color-text-muted)] mt-2 opacity-70">{walletAddress}</p>}
                            </div>
                        )}
                    </section>

                    {errorMsg && (
                        <div className="glass rounded-xl p-4 border border-[var(--color-error)]/30 text-[var(--color-error)] text-xs font-mono break-all">
                            <div className="flex items-center gap-2 mb-1 font-semibold text-sm">
                                <AlertTriangle className="w-4 h-4 shrink-0" /> Error
                            </div>
                            {errorMsg}
                        </div>
                    )}

                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Single Claim Card */}
                        <div className="glass rounded-2xl p-6 border border-[var(--glass-border)]">
                            <div className="flex items-center gap-2 mb-4">
                                <Coins className="w-5 h-5 text-[var(--color-brand)]" />
                                <h3 className="font-semibold text-lg">Single Claim</h3>
                            </div>
                            <p className="text-sm text-[var(--color-text-muted)] mb-5">
                                Specify exact contract info to claim an individual subscription.
                            </p>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs uppercase tracking-widest text-[var(--color-text-faint)] block mb-1">Contract Address</label>
                                    <input
                                        type="text"
                                        value={contractAddress}
                                        onChange={e => setContractAddress(e.target.value)}
                                        placeholder="p2sh..."
                                        className="w-full bg-[var(--color-surface-alt)] border border-[var(--glass-border)] rounded-xl px-4 py-2 text-sm text-white focus:border-[var(--color-brand)] focus:outline-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs uppercase tracking-widest text-[var(--color-text-faint)] block mb-1">Token Category</label>
                                    <input
                                        type="text"
                                        value={tokenCategory}
                                        onChange={e => setTokenCategory(e.target.value)}
                                        placeholder="Hex token id"
                                        className="w-full bg-[var(--color-surface-alt)] border border-[var(--glass-border)] rounded-xl px-4 py-2 text-sm text-white focus:border-[var(--color-brand)] focus:outline-none transition-colors"
                                    />
                                </div>

                                <button
                                    onClick={runClaim}
                                    disabled={loading || !contractAddress || !tokenCategory}
                                    className="w-full flex justify-center items-center gap-2 py-2.5 rounded-xl text-sm font-semibold
                                        bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)]
                                        hover:bg-[var(--color-brand-light)] disabled:opacity-40 transition-all shadow-sm"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                                    Trigger Single Claim
                                </button>
                            </div>

                            {claimData && (
                                <div className="mt-5 flex flex-col gap-3 animate-fade-in border-t border-[var(--glass-border)] pt-5">
                                    <div className="flex items-center gap-2 text-[var(--color-success)] mb-2">
                                        <CheckCircle2 className="w-5 h-5" />
                                        <span className="font-semibold text-sm">Claim Successful</span>
                                    </div>
                                    <MonoRow label="Claim txid" value={claimData.txid} />
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <div className="bg-[var(--color-surface-alt)] rounded-xl p-3">
                                            <p className="text-[9px] uppercase tracking-widest text-[var(--color-text-faint)]">Claimed Amount</p>
                                            <p className="text-sm md:text-base font-bold font-mono text-[var(--color-success)] mt-0.5">
                                                {Number(claimData.claimedSats).toLocaleString()} sats
                                            </p>
                                        </div>
                                        <div className="bg-[var(--color-surface-alt)] rounded-xl p-3">
                                            <p className="text-[9px] uppercase tracking-widest text-[var(--color-text-faint)]">Remaining Balance</p>
                                            <p className="text-sm md:text-base font-bold font-mono text-[var(--color-brand)] mt-0.5">
                                                {claimData.newBalance} sats
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Batch Claim Card */}
                        <div className="glass rounded-2xl p-6 border border-[var(--glass-border)] flex flex-col">
                            <div className="flex items-center gap-2 mb-4">
                                <Zap className="w-5 h-5 text-[var(--color-brand)]" />
                                <h3 className="font-semibold text-lg">Batch Claim All</h3>
                            </div>
                            <p className="text-sm text-[var(--color-text-muted)] mb-5">
                                Automatically iterate through all active subscription contracts and simultaneously claim all pending satoshis globally.
                            </p>

                            <div className="mt-auto">
                                <button
                                    onClick={runBatchClaim}
                                    disabled={batchLoading}
                                    className="w-full flex justify-center items-center gap-2 py-2.5 rounded-xl text-sm font-semibold mb-2
                                        border border-[var(--color-brand)] text-[var(--color-brand)]
                                        hover:bg-[var(--color-brand)]/10 disabled:opacity-40 transition-all shadow-sm"
                                >
                                    {batchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                    Execute Batch Claim
                                </button>
                                <p className="text-center text-[10px] text-[var(--color-text-faint)] mt-2">
                                    Calls endpoint: POST /merchant/claim-all
                                </p>
                            </div>

                            {batchResult && (
                                <div className="mt-5 flex flex-col gap-3 animate-fade-in border-t border-[var(--glass-border)] pt-5">
                                    <div className="flex items-center gap-2 text-[var(--color-success)] mb-2">
                                        <CheckCircle2 className="w-5 h-5" />
                                        <span className="font-semibold text-sm">Batch Complete</span>
                                    </div>
                                    <div className="bg-[var(--color-surface-alt)] rounded-xl p-3 mb-2">
                                        <p className="text-[9px] uppercase tracking-widest text-[var(--color-text-faint)]">Total Sats Swept To Merchant Wallet</p>
                                        <p className="text-lg font-bold font-mono text-[var(--color-success)] mt-0.5">
                                            {Number(batchResult.totalClaimedSats || 0).toLocaleString()} sats
                                        </p>
                                    </div>
                                    <p className="text-xs text-[var(--color-text-muted)]">{batchResult.message}</p>

                                    {batchResult.results && batchResult.results.length > 0 && (
                                        <div className="mt-2 space-y-2 max-h-40 overflow-y-auto pr-1">
                                            <p className="text-[10px] uppercase tracking-widest text-[var(--color-text-faint)]">Log Details</p>
                                            {batchResult.results.map((r: any, i: number) => (
                                                <div key={i} className="text-xs bg-black/40 p-2 rounded border border-[var(--glass-border)]">
                                                    <span className="text-[10px] text-gray-400 font-mono block mb-1">{r.tokenCategory.substring(0, 12)}...</span>
                                                    {r.status === "claimed" ? (
                                                        <span className="text-[var(--color-success)]">+ {r.claimedSats} sats</span>
                                                    ) : r.status === "error" ? (
                                                        <span className="text-[var(--color-error)] text-[10px]">Error: {r.error}</span>
                                                    ) : (
                                                        <span className="text-[var(--color-text-muted)]">Status: {r.status}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

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
                                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider ${sub.status === 'active' ? 'bg-green-500/10 text-green-400 border border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]' :
                                                            sub.status === 'cancelled' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                                                'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                                                            }`}>
                                                            {sub.status === 'active' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                                                            {sub.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <div className="flex items-center gap-2">
                                                            <code className="px-2.5 py-1 rounded bg-[var(--color-bg)] border border-[var(--glass-border)] font-mono text-[11px] text-[var(--color-text-muted)]">
                                                                {String(sub.tokenCategory).substring(0, 20)}...
                                                            </code>
                                                            <CopyBtn value={String(sub.tokenCategory)} />
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1.5">
                                                            <span className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wider">Address:</span>
                                                            <code className="text-[10px] font-mono text-[var(--color-text-faint)] truncate max-w-[120px]" title={sub.contractAddress}>
                                                                {String(sub.contractAddress).substring(0, 15)}...
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

                </div>
            </main>

            <Footer />
        </div>
    );
}

"use client";

import { useState } from "react";
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

                </div>
            </main>

            <Footer />
        </div>
    );
}

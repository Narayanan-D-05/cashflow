"use client";

import { useState, useCallback, useEffect } from "react";
import Header from "@/components/header";
import Footer from "@/components/footer";
import CursorGlow from "@/components/cursor-glow";
import { api } from "@/lib/api";
import {
    CheckCircle2,
    Circle,
    Loader2,
    AlertTriangle,
    Copy,
    Check,
    ExternalLink,
    RefreshCw,
    Zap,
    Key,
    Wallet,
    Play,
    ArrowDown,
    Coins,
    TrendingUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = "idle" | "running" | "done" | "error";

interface SessionData {
    subscriberAddress: string;
    subscriberWif: string;
    contractAddress: string;
    tokenAddress: string;
    genesisCommitment: string;
    depositSats: number;
    authorizedSats: number;
    intervalBlocks: number;
    startBlock: number;
    hint: string;
}

interface FundData {
    txid: string;
    tokenCategory: string;
    contractAddress: string;
    depositSats: string;
    authorizedSats: string;
    intervalBlocks: number;
}

interface ApiCallData {
    message: string;
    flow: { step3: string; step4: string };
    context: {
        requestId: string;
        tokenCategory: string;
        contractAddress: string;
        costSats: number;
        remainingBalance: string;
        pendingSats: string;
    };
    data: { price: { BCH: number; USD: number }; network: string; hint: string };
}

interface ClaimData {
    txid: string;
    claimedSats: number;
    newBalance: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function StepIcon({ status, icon: Icon }: { status: StepStatus; icon: React.ElementType }) {
    if (status === "running") return <Loader2 className="w-5 h-5 text-[var(--color-brand)] animate-spin" />;
    if (status === "done") return <CheckCircle2 className="w-5 h-5 text-[var(--color-success)]" />;
    if (status === "error") return <AlertTriangle className="w-5 h-5 text-[var(--color-error)]" />;
    return <Icon className="w-5 h-5 text-[var(--color-text-faint)]" />;
}

// ─── Step card wrapper ────────────────────────────────────────────────────────

function StepCard({
    number,
    title,
    subtitle,
    status,
    icon,
    children,
}: {
    number: number;
    title: string;
    subtitle: string;
    status: StepStatus;
    icon: React.ElementType;
    children?: React.ReactNode;
}) {
    const borderColor =
        status === "done" ? "border-[var(--color-success)]/30" :
            status === "running" ? "border-[var(--color-brand)]/40" :
                status === "error" ? "border-[var(--color-error)]/30" :
                    "border-[var(--glass-border)]";

    return (
        <div className={`glass rounded-2xl p-5 border ${borderColor} transition-all duration-300`}>
            <div className="flex items-start gap-3 mb-3">
                {/* Step number badge */}
                <span className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${status === "done" ? "bg-[var(--color-success)]/20 text-[var(--color-success)]" :
                    status === "running" ? "bg-[var(--color-brand)]/20 text-[var(--color-brand)]" :
                        status === "error" ? "bg-[var(--color-error)]/20 text-[var(--color-error)]" :
                            "bg-[var(--color-surface-alt)] text-[var(--color-text-faint)]"
                    }`}>
                    {number}
                </span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <StepIcon status={status} icon={icon} />
                        <h3 className={`font-semibold text-sm ${status === "done" ? "text-[var(--color-success)]" :
                            status === "running" ? "text-[var(--color-brand)]" :
                                status === "error" ? "text-[var(--color-error)]" :
                                    "text-[var(--color-text)]"
                            }`}>{title}</h3>
                    </div>
                    <p className="text-xs text-[var(--color-text-faint)] mt-0.5">{subtitle}</p>
                </div>
            </div>
            {children && <div className="ml-10">{children}</div>}
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SubscriptionPage() {
    // Per-step state
    const [s1, setS1] = useState<StepStatus>("idle");
    const [s2, setS2] = useState<StepStatus>("idle");
    const [s3, setS3] = useState<StepStatus>("idle");
    const [s4, setS4] = useState<StepStatus>("idle");
    const [s5, setS5] = useState<StepStatus>("idle");

    // Data from backend
    const [session, setSession] = useState<SessionData | null>(null);
    const [fundData, setFundData] = useState<FundData | null>(null);
    const [apiData, setApiData] = useState<ApiCallData | null>(null);
    const [claimData, setClaimData] = useState<ClaimData | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // API call counter (for Step 4 repeat calls)
    const [callCount, setCallCount] = useState(0);

    // On mount, load session from localStorage
    useEffect(() => {
        const saved = localStorage.getItem("cashflow402_demo_session");
        if (saved) {
            try {
                setSession(JSON.parse(saved));
                setS1("done");
            } catch (e) {
                console.error("Failed to parse saved session", e);
            }
        }
    }, []);

    function err(msg: string) {
        setErrorMsg(msg);
    }

    // ── Step 1: POST /subscription/create-session ──────────────────────────────
    const runStep1 = useCallback(async () => {
        // If we already have a session in state (loaded from localstorage), don't overwrite it unless explicitly clearing.
        if (session) return;

        setS1("running");
        setSession(null);
        setFundData(null);
        setApiData(null);
        setClaimData(null);
        setS2("idle"); setS3("idle"); setS4("idle"); setS5("idle");
        setErrorMsg(null);
        setCallCount(0);

        try {
            const data = await api.createSession();
            setSession(data);
            localStorage.setItem("cashflow402_demo_session", JSON.stringify(data));
            setS1("done");
            setS2("idle"); // Step 2 is passive — just fund the address
        } catch (e) {
            setS1("error");
            err(String(e));
        }
    }, [session]);

    const clearSession = useCallback(() => {
        localStorage.removeItem("cashflow402_demo_session");
        setSession(null);
        setFundData(null);
        setApiData(null);
        setClaimData(null);
        setS1("idle"); setS2("idle"); setS3("idle"); setS4("idle"); setS5("idle");
        setCallCount(0);
        setErrorMsg(null);
    }, []);

    // ── Step 3: POST /subscription/auto-fund ──────────────────────────────────
    const runStep3 = useCallback(async () => {
        if (!session) return;
        setS3("running");
        setErrorMsg(null);

        try {
            const data = await api.autoFund({
                contractAddress: session.contractAddress,
                subscriberWif: session.subscriberWif,
            });
            setFundData({
                txid: data.txid,
                tokenCategory: data.tokenCategory,
                contractAddress: data.contractAddress,
                depositSats: data.depositSats,
                authorizedSats: data.authorizedSats,
                intervalBlocks: data.intervalBlocks,
            });
            setS3("done");
        } catch (e) {
            setS3("error");
            err(String(e));
        }
    }, [session]);

    // ── Step 4: GET /api/subscription/data (Router402 deduction) ───────────────
    const runStep4 = useCallback(async () => {
        if (!fundData?.tokenCategory) return;
        setS4("running");
        setErrorMsg(null);

        try {
            const data = await api.subscriptionData(fundData.tokenCategory);
            setApiData(data);
            setCallCount(c => c + 1);
            setS4("done");
        } catch (e) {
            setS4("error");
            err(String(e));
        }
    }, [fundData]);

    // ── Step 5: POST /subscription/claim ──────────────────────────────────────
    const runStep5 = useCallback(async () => {
        if (!session?.contractAddress || !fundData?.tokenCategory) return;
        setS5("running");
        setErrorMsg(null);

        try {
            const data = await api.claimSubscription(session.contractAddress, fundData.tokenCategory) as unknown as ClaimData;
            setClaimData(data);
            setS5("done");
        } catch (e) {
            setS5("error");
            err(String(e));
        }
    }, [session, fundData]);

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="relative min-h-screen flex flex-col">
            <CursorGlow />
            <Header />

            <main className="flex-1 pt-24 pb-16">
                <div className="max-w-2xl mx-auto px-4 sm:px-6">

                    {/* ── Header ───────────────────────────────────────────────────── */}
                    <div className="mb-8 animate-fade-in-up">
                        <div className="inline-flex items-center gap-2 text-[var(--color-brand)] text-xs font-mono uppercase tracking-widest mb-3">
                            <Zap className="w-3 h-3" />
                            CashFlow402 · Live on ChipNet
                        </div>
                        <h1 className="text-3xl font-bold font-[var(--font-space-grotesk)] text-gradient mb-2">
                            Subscription Flow
                        </h1>
                        <p className="text-[var(--color-text-muted)] text-sm leading-relaxed">
                            Real end-to-end 5-step subscription backed by a CashScript covenant on Bitcoin Cash ChipNet.
                            Every API call hits the live backend — no mocks, no simulations.
                        </p>
                    </div>

                    {/* ── Global error ─────────────────────────────────────────────── */}
                    {errorMsg && (
                        <div className="glass rounded-xl p-4 mb-5 border border-[var(--color-error)]/30 text-[var(--color-error)] text-xs font-mono break-all animate-fade-in">
                            <div className="flex items-center gap-2 mb-1 font-semibold text-sm">
                                <AlertTriangle className="w-4 h-4 shrink-0" /> Error
                            </div>
                            {errorMsg}
                        </div>
                    )}

                    <div className="flex flex-col gap-4 animate-fade-in-up delay-100">

                        {/* ── STEP 1 ───────────────────────────────────────────────────── */}
                        <StepCard number={1} title="Create Session (Local Wallet)" subtitle="POST /subscription/create-session — generates subscriber keypair + deploys covenant" status={s1} icon={Key}>
                            {!session ? (
                                <button
                                    onClick={runStep1}
                                    disabled={s1 === "running"}
                                    className="flex items-center gap-2 py-2.5 px-5 rounded-xl text-sm font-semibold
                               bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)]
                               hover:bg-[var(--color-brand-light)] disabled:opacity-40
                               transition-all duration-200 glow-sm hover:glow-md mb-4"
                                >
                                    {s1 === "running" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                    Create Session
                                </button>
                            ) : (
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-xs font-semibold text-[var(--color-success)] bg-[var(--color-success)]/10 px-3 py-1.5 rounded-lg border border-[var(--color-success)]/20">
                                        Wallet Restored from Browser
                                    </span>
                                    <button
                                        onClick={clearSession}
                                        className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)] underline transition-colors"
                                    >
                                        Clear Wallet & Start Over
                                    </button>
                                </div>
                            )}

                            {session && (
                                <div className="flex flex-col gap-3 animate-fade-in">
                                    <MonoRow label="Subscriber Address (fund this)" value={session.subscriberAddress} />
                                    <MonoRow label="Contract Address" value={session.contractAddress} />
                                    <MonoRow label="Token Address" value={session.tokenAddress} />
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        {[
                                            { label: "Deposit Required", value: `${session.depositSats.toLocaleString()} sats` },
                                            { label: "Authorized / Interval", value: `${session.authorizedSats.toLocaleString()} sats` },
                                            { label: "Interval Blocks", value: `${session.intervalBlocks} blocks` },
                                        ].map(({ label, value }) => (
                                            <div key={label} className="bg-[var(--color-surface-alt)] rounded-xl p-2">
                                                <p className="text-[9px] uppercase tracking-widest text-[var(--color-text-faint)]">{label}</p>
                                                <p className="text-sm font-bold font-mono text-[var(--color-brand)] mt-0.5">{value}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-[var(--color-text-faint)] italic">{session.hint}</p>
                                </div>
                            )}
                        </StepCard>

                        {/* ── STEP 2 ───────────────────────────────────────────────────── */}
                        <StepCard
                            number={2}
                            title="Fund Subscriber Address"
                            subtitle="Get ChipNet tBCH from the faucet and send to the subscriber address"
                            status={session ? "idle" : "idle"}
                            icon={Wallet}
                        >
                            {session ? (
                                <div className="flex flex-col gap-3 animate-fade-in">
                                    <MonoRow label="Send tBCH to" value={session.subscriberAddress} />
                                    <div className="flex items-start gap-2 p-3 rounded-xl bg-[var(--color-brand)]/10 border border-[var(--color-brand)]/20">
                                        <Zap className="w-4 h-4 text-[var(--color-brand)] shrink-0 mt-0.5" />
                                        <div className="text-xs text-[var(--color-text-muted)]">
                                            Need at least <span className="text-[var(--color-brand)] font-bold font-mono">{(session.depositSats + 1500).toLocaleString()} sats</span> in this address (Deposit + 1500 miner fee).
                                            Get free ChipNet tBCH below or click Pay with Paytaca, then click Auto-Fund.
                                        </div>
                                    </div>
                                    <div className="flex gap-2 flex-wrap items-center">
                                        <a
                                            href={`${session.subscriberAddress}?amount=${(session.depositSats + 1500) / 100000000}`}
                                            className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl text-xs font-semibold
                                               bg-[#00c58e] text-black shadow-[0_0_15px_rgba(0,197,142,0.3)]
                                               hover:bg-[#00db9d] hover:shadow-[0_0_20px_rgba(0,197,142,0.5)] transition-all shrink-0"
                                        >
                                            <Wallet className="w-3.5 h-3.5" />
                                            Pay with Paytaca
                                        </a>
                                        <span className="text-[10px] uppercase text-[var(--color-text-muted)] mx-1">OR</span>
                                        <a
                                            href="https://tbch.googol.cash"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl text-xs font-semibold
                                 border border-[var(--color-brand)]/40 text-[var(--color-brand)]
                                 hover:bg-[var(--color-brand)]/10 transition-all shrink-0"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            tbch.googol.cash faucet
                                        </a>
                                        <a
                                            href={`https://chipnet.imaginary.cash/address/${session.subscriberAddress}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl text-xs font-semibold
                                 border border-[var(--color-border)] text-[var(--color-text-muted)]
                                 hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)] transition-all"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            Watch on explorer
                                        </a>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-[var(--color-text-faint)]">Complete Step 1 first.</p>
                            )}
                        </StepCard>

                        {/* ── STEP 3 ───────────────────────────────────────────────────── */}
                        <StepCard number={3} title="Auto-Fund Contract" subtitle="POST /subscription/auto-fund — server builds &amp; broadcasts genesis UTXO on-chain" status={s3} icon={ArrowDown}>
                            {session ? (
                                <>
                                    <button
                                        onClick={runStep3}
                                        disabled={s3 === "running" || s3 === "done"}
                                        className="flex items-center gap-2 py-2.5 px-5 rounded-xl text-sm font-semibold mb-4
                               bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)]
                               hover:bg-[var(--color-brand-light)]
                               disabled:opacity-40 disabled:cursor-not-allowed
                               transition-all duration-200 glow-sm hover:glow-md"
                                    >
                                        {s3 === "running" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                        {s3 === "running" ? "Broadcasting…" : s3 === "done" ? "Funded ✓" : "Auto-Fund Contract"}
                                    </button>

                                    {fundData && (
                                        <div className="flex flex-col gap-3 animate-fade-in">
                                            <MonoRow label="Funding txid" value={fundData.txid} />
                                            <MonoRow label="Token Category (your subscription NFT)" value={fundData.tokenCategory} />
                                            <div className="flex gap-2">
                                                <a
                                                    href={`https://chipnet.imaginary.cash/tx/${fundData.txid}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl text-xs font-semibold
                                     border border-[var(--color-border)] text-[var(--color-text-muted)]
                                     hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)] transition-all"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" /> View on ChipNet explorer
                                                </a>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p className="text-xs text-[var(--color-text-faint)]">Complete Step 1 first.</p>
                            )}
                        </StepCard>

                        {/* ── STEP 4 ───────────────────────────────────────────────────── */}
                        <StepCard number={4} title="Call Subscription API" subtitle="GET /api/subscription/data — Router402 deducts sats per call from contract balance" status={s4} icon={Play}>
                            {fundData ? (
                                <>
                                    <div className="flex items-center gap-3 mb-4">
                                        <button
                                            onClick={runStep4}
                                            disabled={s4 === "running"}
                                            className="flex items-center gap-2 py-2.5 px-5 rounded-xl text-sm font-semibold
                                 bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)]
                                 hover:bg-[var(--color-brand-light)]
                                 disabled:opacity-40 disabled:cursor-not-allowed
                                 transition-all duration-200 glow-sm hover:glow-md"
                                        >
                                            {s4 === "running" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                            {s4 === "running" ? "Calling…" : "Call API"}
                                        </button>
                                        {callCount > 0 && (
                                            <button
                                                onClick={runStep4}
                                                disabled={s4 === "running"}
                                                className="flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold
                                   border border-[var(--color-border)] text-[var(--color-text-muted)]
                                   hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]
                                   disabled:opacity-40 transition-all"
                                            >
                                                <RefreshCw className="w-3 h-3" /> Call again ({callCount}× so far)
                                            </button>
                                        )}
                                    </div>

                                    {apiData && (
                                        <div className="flex flex-col gap-3 animate-fade-in">
                                            <div className="grid grid-cols-2 gap-2">
                                                {[
                                                    { label: "Cost This Call", value: `${apiData.context.costSats} sats` },
                                                    { label: "Remaining Balance", value: `${apiData.context.remainingBalance} sats` },
                                                    { label: "Pending (unclaimed)", value: `${apiData.context.pendingSats} sats` },
                                                    { label: "Calls Made", value: `${callCount}` },
                                                ].map(({ label, value }) => (
                                                    <div key={label} className="bg-[var(--color-surface-alt)] rounded-xl p-3">
                                                        <p className="text-[9px] uppercase tracking-widest text-[var(--color-text-faint)]">{label}</p>
                                                        <p className="text-base font-bold font-mono text-[var(--color-brand)] mt-0.5">{value}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="bg-[var(--color-surface-alt)] rounded-xl p-3">
                                                <p className="text-[9px] uppercase tracking-widest text-[var(--color-text-faint)] mb-1">Server Response</p>
                                                <p className="text-xs text-[var(--color-success)] font-medium">{apiData.message}</p>
                                                <p className="text-[10px] text-[var(--color-text-faint)] font-mono mt-1">{apiData.flow.step4}</p>
                                            </div>
                                            <p className="text-[10px] text-[var(--color-text-faint)]">
                                                Request ID: <code className="font-mono">{apiData.context.requestId}</code>
                                            </p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p className="text-xs text-[var(--color-text-faint)]">Complete Step 3 first.</p>
                            )}
                        </StepCard>

                        {/* ── STEP 5 ───────────────────────────────────────────────────── */}
                        <StepCard number={5} title="Merchant Claim" subtitle="POST /subscription/claim — builds &amp; broadcasts on-chain claim transaction" status={s5} icon={Coins}>
                            {session ? (
                                <>
                                    <button
                                        onClick={runStep5}
                                        disabled={s5 === "running" || s5 === "done"}
                                        className="flex items-center gap-2 py-2.5 px-5 rounded-xl text-sm font-semibold mb-4
                               bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)]
                               hover:bg-[var(--color-brand-light)]
                               disabled:opacity-40 disabled:cursor-not-allowed
                               transition-all duration-200 glow-sm hover:glow-md"
                                    >
                                        {s5 === "running" ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                                        {s5 === "running" ? "Claiming…" : s5 === "done" ? "Claimed ✓" : "Claim Payments"}
                                    </button>

                                    {claimData && (
                                        <div className="flex flex-col gap-3 animate-fade-in">
                                            <MonoRow label="Claim txid" value={claimData.txid} />
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="bg-[var(--color-surface-alt)] rounded-xl p-3">
                                                    <p className="text-[9px] uppercase tracking-widest text-[var(--color-text-faint)]">Claimed</p>
                                                    <p className="text-base font-bold font-mono text-[var(--color-success)] mt-0.5">
                                                        {Number(claimData.claimedSats).toLocaleString()} sats
                                                    </p>
                                                </div>
                                                <div className="bg-[var(--color-surface-alt)] rounded-xl p-3">
                                                    <p className="text-[9px] uppercase tracking-widest text-[var(--color-text-faint)]">Remaining</p>
                                                    <p className="text-base font-bold font-mono text-[var(--color-brand)] mt-0.5">
                                                        {claimData.newBalance} sats
                                                    </p>
                                                </div>
                                            </div>
                                            <a
                                                href={`https://chipnet.imaginary.cash/tx/${claimData.txid}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl text-xs font-semibold
                                   border border-[var(--color-border)] text-[var(--color-text-muted)]
                                   hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)] transition-all w-fit"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" /> View claim tx on explorer
                                            </a>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p className="text-xs text-[var(--color-text-faint)]">Complete Step 1 first.</p>
                            )}
                        </StepCard>

                    </div>

                    {/* ── Flow complete ──────────────────────────────────────────────── */}
                    {s5 === "done" && (
                        <div className="mt-6 glass rounded-2xl p-6 border border-[var(--color-success)]/30 animate-fade-in-up">
                            <div className="flex items-center gap-3 mb-3">
                                <CheckCircle2 className="w-6 h-6 text-[var(--color-success)]" />
                                <h3 className="font-bold text-[var(--color-success)]">All 5 Steps Complete</h3>
                            </div>
                            <p className="text-sm text-[var(--color-text-muted)]">
                                You just ran a full CashFlow402 subscription cycle on ChipNet:{" "}
                                <span className="text-[var(--color-text)]">covenant deployed → funded on-chain → API called with per-call deduction → merchant claimed BCH.</span>
                            </p>
                            <button
                                onClick={clearSession}
                                className="mt-4 flex items-center gap-2 py-2 px-5 rounded-xl text-sm font-semibold
                           border border-[var(--color-border)] text-[var(--color-text-muted)]
                           hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)] transition-all"
                            >
                                <RefreshCw className="w-4 h-4" /> Start Over
                            </button>
                        </div>
                    )}

                    {/* ── Legend ─────────────────────────────────────────────────────── */}
                    <div className="mt-8 glass rounded-2xl p-4 animate-fade-in-up delay-200">
                        <p className="text-[10px] uppercase tracking-widest text-[var(--color-text-faint)] mb-3">What this demo hits</p>
                        <div className="flex flex-col gap-1.5">
                            {[
                                ["POST", "/subscription/create-session", "Server generates keypair, deploys CashScript covenant"],
                                ["–", "tbch.googol.cash faucet", "You fund subscriber address with ChipNet tBCH"],
                                ["POST", "/subscription/auto-fund", "Server builds genesis UTXO + broadcasts on ChipNet"],
                                ["GET", "/api/subscription/data", "Router402 middleware deducts sats per call"],
                                ["POST", "/subscription/claim", "Server builds claim tx + broadcasts on ChipNet"],
                            ].map(([method, path, desc]) => (
                                <div key={path} className="flex items-start gap-2 text-xs">
                                    <code className={`shrink-0 font-mono font-bold text-[10px] px-1.5 py-0.5 rounded ${method === "GET" ? "bg-[var(--color-info)]/15 text-[var(--color-info)]" :
                                        method === "POST" ? "bg-[var(--color-brand)]/15 text-[var(--color-brand)]" :
                                            "bg-[var(--color-surface-alt)] text-[var(--color-text-faint)]"
                                        }`}>{method}</code>
                                    <code className="text-[var(--color-text-muted)] shrink-0">{path}</code>
                                    <span className="text-[var(--color-text-faint)]">— {desc}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </main>

            <Footer />
        </div>
    );
}

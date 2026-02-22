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
    authorizedSats?: number;  // legacy
    maxSats?: number;         // metered billing ceiling
    intervalBlocks: number;
    startBlock: number;
    hint: string;
}

interface FundData {
    txid: string;
    tokenCategory: string;
    contractAddress: string;
    depositSats: string;
    authorizedSats?: string;  // legacy
    maxSats?: string;         // metered billing ceiling
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
    const [callbackUrl, setCallbackUrl] = useState<string | null>(null);

    // On mount: if coming from merchant redirect (callbackUrl present),
    // always clear stale localStorage and auto-create a fresh session.
    // Otherwise, restore saved session but validate it against the backend first.
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const cb = urlParams.get("callbackUrl");
        setCallbackUrl(cb);

        const saved = localStorage.getItem("cashflow402_demo_session");

        if (cb) {
            // Coming from merchant redirect — always start fresh
            localStorage.removeItem("cashflow402_demo_session");
            // Auto-create new session after short delay so UI renders first
            setTimeout(() => {
                void (async () => {
                    setS1("running");
                    try {
                        const data = await api.createSession();
                        setSession(data);
                        localStorage.setItem("cashflow402_demo_session", JSON.stringify(data));
                        setS1("done");
                    } catch (e) {
                        setS1("error");
                        setErrorMsg(String(e));
                    }
                })();
            }, 300);
            return;
        }

        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Validate session against backend before restoring
                fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/subscription/status/${encodeURIComponent(parsed.contractAddress)}`)
                    .then(r => {
                        if (r.ok) {
                            setSession(parsed);
                            setS1("done");
                        } else {
                            // Backend doesn't know this contract — stale session, clear it
                            localStorage.removeItem("cashflow402_demo_session");
                        }
                    })
                    .catch(() => {
                        // Network error — restore optimistically
                        setSession(parsed);
                        setS1("done");
                    });
            } catch (e) {
                console.error("Failed to parse saved session", e);
                localStorage.removeItem("cashflow402_demo_session");
            }
        }
    }, []);

    function err(msg: string) {
        setErrorMsg(msg);
    }

    // ── Step 1: POST /subscription/create-session ──────────────────────────────
    const runStep1 = useCallback(async () => {
        // Already have a valid session — don't overwrite unless user clears first
        if (session) return;

        setS1("running");
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
        } catch (e: any) {
            setS1("error");
            err(`Failed to connect to backend (Port 3000). Error: ${e.message || String(e)}`);
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

    // ── Cancel: POST /subscription/cancel ─────────────────────────────
    const [cancelData, setCancelData] = useState<{ txid: string; refundedSats: string } | null>(null);
    const [sCancelStatus, setSCancelStatus] = useState<"idle" | "running" | "done" | "error">("idle");
    const [confirmWithdraw, setConfirmWithdraw] = useState(false);

    const runCancel = useCallback(async () => {
        if (!session?.contractAddress || !session?.subscriberWif) return;
        setSCancelStatus("running");
        setConfirmWithdraw(false);
        setErrorMsg(null);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/subscription/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contractAddress: session.contractAddress,
                    subscriberWif: session.subscriberWif,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? JSON.stringify(data));
            setCancelData({ txid: data.txid, refundedSats: data.refundedSats });
            setSCancelStatus("done");
        } catch (e) {
            setSCancelStatus("error");
            err(String(e));
        }
    }, [session]);

    const activeStepId = s3 === "done" ? 4 : session ? 2 : 1;
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
                            Subscription Funding
                        </h1>
                        <p className="text-[var(--color-text-muted)] text-sm leading-relaxed">
                            Fund your contract to unlock the AI agent without trusting the merchant. You control your funds.
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


                    {/* ── STEPPER WIZARD ─────────────────────────────────────────────── */}
                    <div className="flex flex-col animate-fade-in-up delay-100 mb-8">
                        <div className="flex items-center gap-2 sm:gap-4 justify-between sm:justify-center overflow-x-auto pb-4 px-2 no-scrollbar">
                            {[
                                { step: 1, label: "Create Session", icon: Key, isDone: !!session },
                                { step: 2, label: "Fund Address", icon: Wallet, isDone: !!fundData || s3 === "done" },
                                { step: 3, label: "Auto-Fund", icon: ArrowDown, isDone: s3 === "done" }
                            ].map((item, idx, arr) => {
                                const isActive = activeStepId === item.step || (activeStepId === 4 && item.step === 3);
                                return (
                                    <div key={item.step} className="flex items-center gap-2 sm:gap-4 shrink-0">
                                        <div className={`flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl border transition-all ${isActive ? 'bg-[var(--color-brand)]/10 border-[var(--color-brand)] text-[var(--color-brand)] glow-sm' : item.isDone ? 'bg-[var(--color-success)]/10 border-[var(--color-success)]/30 text-[var(--color-success)]' : 'border-[var(--glass-border)] text-[var(--color-text-faint)]'}`}>
                                            {item.isDone && !isActive ? <CheckCircle2 className="w-4 h-4" /> : <item.icon className="w-4 h-4" />}
                                            <span className="text-xs sm:text-sm font-semibold whitespace-nowrap">{item.label}</span>
                                        </div>
                                        {idx < arr.length - 1 && (
                                            <div className={`h-px w-6 sm:w-10 ${item.isDone ? 'bg-[var(--color-success)]/30' : 'bg-[var(--glass-border)]'}`} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── ACTIVE STEP CONTENT ─────────────────────────────────────────────── */}
                    <div className="glass rounded-2xl p-6 sm:p-8 border border-[var(--glass-border)] animate-fade-in-up delay-150 transition-all mb-8 shadow-xl relative overflow-hidden">
                        {/* Background subtle glow */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-[var(--color-brand)]/5 blur-[50px] pointer-events-none rounded-full"></div>

                        {(!session) && (
                            <div className="flex flex-col gap-5 animate-fade-in relative z-10">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--color-brand)]/10 flex items-center justify-center border border-[var(--color-brand)]/20">
                                        <Key className="w-5 h-5 text-[var(--color-brand)]" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-xl text-[var(--color-text)]">Create Session (Local Wallet)</h3>
                                        <p className="text-sm text-[var(--color-text-faint)] mt-0.5">POST /subscription/create-session</p>
                                    </div>
                                </div>
                                <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                                    This auto-generates a disposable subscriber keypair and deploys a unique "Covenant" Smart Contract onto Bitcoin Cash.
                                </p>
                                <button
                                    onClick={runStep1}
                                    disabled={s1 === "running"}
                                    className="w-fit flex items-center gap-2 py-3 px-6 rounded-xl text-sm font-semibold
                                    bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)]
                                    hover:bg-[var(--color-brand-light)] disabled:opacity-40
                                    transition-all duration-200 glow-sm hover:glow-md mt-2"
                                >
                                    {s1 === "running" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                                    {s1 === "running" ? "Deploying Covenant..." : "Create Session"}
                                </button>
                            </div>
                        )}

                        {session && s3 !== "done" && (
                            <div className="flex flex-col gap-6 animate-fade-in relative z-10">
                                <div className="flex items-center justify-between flex-wrap gap-4 border-b border-[var(--glass-border)] pb-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-[var(--color-success)]/10 flex items-center justify-center border border-[var(--color-success)]/20">
                                            <Wallet className="w-5 h-5 text-[var(--color-success)]" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-xl text-[var(--color-text)]">Fund & Auto-Fund</h3>
                                            <p className="text-sm text-[var(--color-text-faint)] mt-0.5">Fund your newly deployed covenant lockbox.</p>
                                        </div>
                                    </div>
                                    <button onClick={clearSession} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)] underline transition-colors px-2">
                                        Clear Wallet & Start Over
                                    </button>
                                </div>

                                <div className="flex flex-col gap-4">
                                    <MonoRow label="Subscriber Address (Fund This)" value={session.subscriberAddress} />
                                    <MonoRow label="Contract Address" value={session.contractAddress} dimValue />

                                    <div className="grid grid-cols-3 gap-3 text-center mt-2">
                                        {[
                                            { label: "Deposit Required", value: `9,500 sats` },
                                            { label: "Max Claimable", value: `9,500 sats` },
                                            { label: "Claim Interval", value: `${session.intervalBlocks} blocks` },
                                        ].map(({ label, value }) => (
                                            <div key={label} className="bg-[var(--color-surface-alt)]/50 rounded-xl p-3 border border-[var(--glass-border)]">
                                                <p className="text-[9px] uppercase tracking-widest text-[var(--color-text-faint)]">{label}</p>
                                                <p className="text-sm font-bold font-mono text-[var(--color-brand)] mt-1">{value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--color-brand)]/10 border border-[var(--color-brand)]/20 mt-2">
                                        <Zap className="w-5 h-5 text-[var(--color-brand)] shrink-0 mt-0.5" />
                                        <div className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                                            Send exactly <span className="text-[var(--color-brand)] font-bold font-mono">11,000 sats</span> to the Subscriber Address.
                                            Once funded, click the Auto-Fund button below to broadcast the initial NFT state.
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-3 items-center mt-2">
                                        <a
                                            href={`${session.subscriberAddress}?amount=${11000 / 100000000}`}
                                            className="inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-semibold
                                                bg-[#00c58e] text-black shadow-[0_0_15px_rgba(0,197,142,0.3)]
                                                hover:bg-[#00db9d] hover:shadow-[0_0_20px_rgba(0,197,142,0.5)] transition-all shrink-0"
                                        >
                                            <Wallet className="w-4 h-4" /> Pay with Paytaca
                                        </a>
                                        <span className="text-xs uppercase text-[var(--color-text-muted)] font-bold px-2">OR</span>
                                        <a
                                            href="https://tbch.googol.cash"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-semibold
                                    border border-[var(--color-brand)]/40 text-[var(--color-brand)]
                                    hover:bg-[var(--color-brand)]/10 transition-all shrink-0"
                                        >
                                            <ExternalLink className="w-4 h-4" /> tbch.googol.cash faucet
                                        </a>
                                    </div>

                                    <div className="border-t border-[var(--glass-border)] mt-4 pt-6">
                                        <button
                                            onClick={runStep3}
                                            disabled={s3 === "running"}
                                            className="w-full flex justify-center items-center gap-2 py-3.5 px-6 rounded-xl text-base font-bold
                                bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)]
                                hover:bg-[var(--color-brand-light)] disabled:opacity-40
                                transition-all duration-200 glow-sm hover:glow-md"
                                        >
                                            {s3 === "running" ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowDown className="w-5 h-5" />}
                                            {s3 === "running" ? "Broadcasting Genesis Tx..." : "Auto-Fund Contract On-Chain"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {(s3 === "done" && activeStepId >= 3) && (
                            <div className="flex flex-col gap-6 animate-fade-in relative z-10">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--color-success)]/10 flex items-center justify-center border border-[var(--color-success)]/20">
                                        <CheckCircle2 className="w-5 h-5 text-[var(--color-success)]" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-xl text-[var(--color-text)]">Subscription Active</h3>
                                        <p className="text-sm text-[var(--color-text-faint)] mt-0.5">Ready to use the AI Agent</p>
                                    </div>
                                </div>

                                {fundData && (
                                    <div className="flex flex-col gap-4 border border-[var(--glass-border)] p-5 rounded-xl bg-[var(--color-surface-alt)]/20">
                                        <MonoRow label="Genesis TxID" value={fundData.txid} />
                                        <MonoRow label="Subscription NFT Category" value={fundData.tokenCategory} />

                                        <div className="flex gap-3 mt-2 flex-wrap">
                                            <a
                                                href={`https://chipnet.imaginary.cash/tx/${fundData.txid}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold
                                border border-[var(--color-border)] text-[var(--color-text-muted)]
                                hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)] transition-all"
                                            >
                                                <ExternalLink className="w-4 h-4" /> View on Explorer
                                            </a>
                                            {callbackUrl && (
                                                <a
                                                    href={`${callbackUrl}?tokenCategory=${fundData.tokenCategory}`}
                                                    className="inline-flex items-center gap-2 py-2.5 px-6 rounded-xl text-sm font-bold
                                                    bg-[#3b82f6] text-white shadow-[0_0_15px_rgba(59,130,246,0.3)] 
                                                    hover:bg-[#60a5fa] hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-all"
                                                >
                                                    <Zap className="w-4 h-4" /> Continue to Merchant App
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="border-t border-[var(--glass-border)] pt-6 mt-2">
                                    {cancelData ? (
                                        <div className="flex flex-col gap-4 p-5 rounded-xl border border-green-500/30 bg-green-950/20">
                                            <div className="flex items-center gap-2 text-green-400 font-bold mb-1">
                                                ✅ Refunded {cancelData.refundedSats} sats successfully!
                                            </div>
                                            <MonoRow label="Refund TxID" value={cancelData.txid} />
                                            <div className="flex gap-3 mt-2">
                                                <a
                                                    href={`https://chipnet.imaginary.cash/tx/${cancelData.txid}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold
                                                        border border-[var(--color-border)] text-[var(--color-text-muted)]
                                                        hover:border-green-400 hover:text-green-400 transition-all"
                                                >
                                                    <ExternalLink className="w-4 h-4" /> View Refund
                                                </a>
                                                <button
                                                    onClick={clearSession}
                                                    className="flex items-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold
                                                        border border-[var(--color-border)] text-[var(--color-text-muted)]
                                                        hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)] transition-all"
                                                >
                                                    🔄 Start Over
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            <p className="text-sm text-[var(--color-text-muted)] mb-1">
                                                Finished with the service? You can safely withdraw your unused balance.
                                            </p>
                                            {confirmWithdraw ? (
                                                <div className="flex flex-col gap-3 p-4 rounded-xl border border-red-500/40 bg-red-950/20 animate-fade-in">
                                                    <p className="text-sm text-red-400 font-bold mb-1">
                                                        ⚠️ Warning: This burns your active subscription NFT and returns remaining funds.
                                                    </p>
                                                    <div className="flex gap-3">
                                                        <button
                                                            onClick={runCancel}
                                                            disabled={sCancelStatus === "running"}
                                                            className="flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-sm font-bold
                                                            bg-red-600 text-white hover:bg-red-500
                                                            disabled:opacity-40 transition-all"
                                                        >
                                                            {sCancelStatus === "running" ? <><Loader2 className="w-4 h-4 animate-spin" /> Canceling...</> : <>✅ Yes, Withdraw Funds</>}
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmWithdraw(false)}
                                                            className="py-2.5 px-5 rounded-xl text-sm font-semibold
                                                            border border-[var(--glass-border)] text-[var(--color-text-muted)]
                                                            hover:border-white transition-all"
                                                        >
                                                            Nevermind
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setConfirmWithdraw(true)}
                                                    className="w-fit flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-sm font-semibold
                                                    bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white
                                                    border border-red-500/30 transition-all duration-200"
                                                >
                                                    💸 Withdraw Remaining Balance
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    {/* ── Legend ─────────────────────────────────────────────────────── */}
                    <div className="mt-8 glass rounded-2xl p-4 animate-fade-in-up delay-200">
                        <p className="text-[10px] uppercase tracking-widest text-[var(--color-text-faint)] mb-3">What this demo hits</p>
                        <div className="flex flex-col gap-1.5">
                            {[
                                ["POST", "/subscription/create-session", "Server generates keypair, deploys CashScript covenant"],
                                ["–", "tbch.googol.cash faucet", "You fund subscriber address with ChipNet tBCH"],
                                ["POST", "/subscription/auto-fund", "Server builds genesis UTXO + broadcasts on ChipNet"],
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
            </main >

            <Footer />
        </div >
    );
}

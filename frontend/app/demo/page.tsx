"use client";

import { useState } from "react";
import Header from "@/components/header";
import Footer from "@/components/footer";
import CursorGlow from "@/components/cursor-glow";
import { api, type ChallengeResult } from "@/lib/api";
import {
  Play,
  CheckCircle,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  Zap,
} from "lucide-react";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Phase =
  | "idle"
  | "fetching-challenge"   // GET /api/premium/hello â†’ 402 + GET /payment/challenge
  | "awaiting-payment"     // show address/amount, await user txid input
  | "verifying"            // POST /verify-payment
  | "accessing"            // GET /api/premium/hello with token
  | "done"
  | "error";

interface StepState {
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

const STEP_LABELS = [
  "GET /api/premium/hello â€” receive 402 challenge",
  "GET /payment/challenge â€” get nonce & payment address",
  "Send real BCH to the provided address",
  "POST /verify-payment â€” submit txid, receive token",
  "GET /api/premium/hello â€” access granted (200)",
];

function stepFromPhase(phase: Phase): number {
  switch (phase) {
    case "fetching-challenge": return 0;
    case "awaiting-payment":   return 2;
    case "verifying":          return 3;
    case "accessing":          return 4;
    case "done":               return 5;
    default: return -1;
  }
}

// â”€â”€â”€ Copy button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CopyButton({ value }: { value: string }) {
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
      {copied ? <Check className="w-3.5 h-3.5 text-[oklch(0.55_0.18_140)]" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function DemoPage() {
  const [phase, setPhase]         = useState<Phase>("idle");
  const [steps, setSteps]         = useState<StepState[]>(STEP_LABELS.map(() => ({ status: "pending" })));
  const [challenge, setChallenge] = useState<ChallengeResult | null>(null);
  const [txidInput, setTxidInput] = useState("");
  const [token, setToken]         = useState<string | null>(null);
  const [protectedBody, setProtectedBody] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  function setStep(idx: number, patch: Partial<StepState>) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  function reset() {
    setPhase("idle");
    setSteps(STEP_LABELS.map(() => ({ status: "pending" })));
    setChallenge(null);
    setTxidInput("");
    setToken(null);
    setProtectedBody(null);
    setErrorMsg(null);
  }

  async function startFlow() {
    reset();
    setPhase("fetching-challenge");

    try {
      // Step 0: Hit protected endpoint â€” expect 402
      setStep(0, { status: "running" });
      const resp402 = await api.raw("GET", "/api/premium/hello");
      if (resp402.status !== 402) {
        throw new Error(`Expected 402 from /api/premium/hello, got ${resp402.status}`);
      }
      const body402 = await resp402.json().catch(() => ({}));
      setStep(0, { status: "done", detail: `402 â€” ${body402?.error ?? "Payment Required"}` });

      // Step 1: Get challenge from /payment/challenge
      setStep(1, { status: "running" });
      const ch = await api.getChallenge({ path: "/api/premium/hello" });
      setChallenge(ch);
      setStep(1, {
        status: "done",
        detail: `Nonce: ${ch.nonce.slice(0, 18)}â€¦  |  ${ch.amountSats} sats`,
      });

      setPhase("awaiting-payment");
    } catch (e) {
      const msg = String(e);
      setErrorMsg(msg);
      setPhase("error");
      setSteps(prev =>
        prev.map(s => s.status === "running" ? { ...s, status: "error", detail: msg } : s),
      );
    }
  }

  async function verifyAndAccess() {
    if (!challenge || !txidInput.trim()) return;
    const txid = txidInput.trim();

    try {
      // Mark step 2 (payment) done â€” user confirms they sent it
      setStep(2, { status: "done", detail: `txid: ${txid.slice(0, 20)}â€¦` });

      // Step 3: Verify payment
      setPhase("verifying");
      setStep(3, { status: "running" });
      const accessToken = await api.verifyPayment({ nonce: challenge.nonce, txid });
      setToken(accessToken);
      setStep(3, { status: "done", detail: `Bearer: ${accessToken.slice(0, 28)}â€¦` });

      // Step 4: Access protected endpoint with token
      setPhase("accessing");
      setStep(4, { status: "running" });
      const resp200 = await api.rawWithToken("GET", "/api/premium/hello", accessToken);
      if (resp200.status !== 200) {
        throw new Error(`Expected 200, got ${resp200.status}`);
      }
      const data = await resp200.json();
      setProtectedBody(JSON.stringify(data, null, 2));
      setStep(4, { status: "done", detail: `200 OK â€” ${JSON.stringify(data).slice(0, 60)}` });

      setPhase("done");
    } catch (e) {
      const msg = String(e);
      setErrorMsg(msg);
      setPhase("error");
      setSteps(prev =>
        prev.map(s => s.status === "running" ? { ...s, status: "error", detail: msg } : s),
      );
    }
  }

  const activeStep = stepFromPhase(phase);

  return (
    <div className="relative min-h-screen flex flex-col">
      <CursorGlow />
      <Header />
      <main className="flex-1 pt-24 pb-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">

          {/* Heading */}
          <div className="mb-8 animate-fade-in-up">
            <div className="inline-flex items-center gap-2 text-[var(--color-brand)] text-xs font-mono uppercase tracking-widest mb-3">
              <Zap className="w-3 h-3" />
              Live Demo
            </div>
            <h1 className="text-3xl font-bold font-[var(--font-space-grotesk)] text-gradient mb-2">
              HTTP 402 Payment Flow
            </h1>
            <p className="text-[var(--color-text-muted)]">
              Real end-to-end per-call BCH payment against the live backend.
              Backend must be running on{" "}
              <code className="bg-[var(--color-surface-alt)] px-1 rounded text-xs">
                localhost:3000
              </code>{" "}
              with <code className="bg-[var(--color-surface-alt)] px-1 rounded text-xs">MERCHANT_ADDRESS</code> set.
            </p>
          </div>

          {/* Steps */}
          <div className="glass rounded-2xl p-6 mb-6 animate-fade-in-up delay-100">
            <ol className="flex flex-col gap-4">
              {steps.map((step, i) => {
                const isActive = i === activeStep || (phase === "awaiting-payment" && i === 2);
                return (
                  <li key={i} className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {step.status === "pending" && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-border)] text-[10px] text-[var(--color-text-faint)]">
                          {i + 1}
                        </span>
                      )}
                      {step.status === "running" && (
                        <Loader2 className="h-5 w-5 text-[var(--color-brand)] animate-spin" />
                      )}
                      {step.status === "done" && (
                        <CheckCircle className="h-5 w-5 text-[oklch(0.55_0.18_140)]" />
                      )}
                      {step.status === "error" && (
                        <AlertCircle className="h-5 w-5 text-[oklch(0.55_0.22_25)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${
                        step.status === "done"    ? "text-[var(--color-text)]" :
                        step.status === "error"   ? "text-[oklch(0.55_0.22_25)]" :
                        step.status === "running" ? "text-[var(--color-brand)]" :
                        isActive                  ? "text-[var(--color-text-muted)]" :
                        "text-[var(--color-text-faint)]"
                      }`}>
                        {STEP_LABELS[i]}
                      </p>
                      {step.detail && (
                        <p className="text-xs font-mono text-[var(--color-text-faint)] mt-0.5 break-all">
                          {step.detail}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Payment panel â€” shown while awaiting_payment */}
          {phase === "awaiting-payment" && challenge && (
            <div className="glass rounded-2xl p-6 mb-6 border border-[var(--color-border-brand)] animate-fade-in-up">
              <h2 className="font-semibold mb-4 flex items-center gap-2 text-[var(--color-brand)]">
                <Zap className="w-4 h-4" />
                Send BCH Payment
              </h2>

              {/* Amount */}
              <div className="mb-4">
                <label className="text-xs text-[var(--color-text-faint)] uppercase tracking-wider">Amount</label>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-2xl font-bold font-mono">
                    {challenge.amountSats.toLocaleString()}
                    <span className="text-sm text-[var(--color-brand)] ml-1">sats</span>
                  </p>
                </div>
              </div>

              {/* Merchant address */}
              <div className="mb-4">
                <label className="text-xs text-[var(--color-text-faint)] uppercase tracking-wider">
                  Pay to address
                </label>
                <div className="flex items-center gap-2 mt-1 bg-[var(--color-surface-alt)] rounded-xl px-3 py-2">
                  <code className="flex-1 text-xs font-mono break-all text-[var(--color-text)]">
                    {challenge.merchantAddress}
                  </code>
                  <CopyButton value={challenge.merchantAddress} />
                </div>
              </div>

              {/* BIP-21 URI */}
              <div className="mb-5">
                <label className="text-xs text-[var(--color-text-faint)] uppercase tracking-wider">
                  BIP-21 Payment URI
                </label>
                <div className="flex items-center gap-2 mt-1 bg-[var(--color-surface-alt)] rounded-xl px-3 py-2">
                  <code className="flex-1 text-xs font-mono break-all text-[var(--color-brand)]">
                    {challenge.paymentUri}
                  </code>
                  <CopyButton value={challenge.paymentUri} />
                  <a
                    href={challenge.paymentUri}
                    className="shrink-0 p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] hover:text-[var(--color-brand)] transition-all"
                    title="Open in wallet"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <p className="text-[10px] text-[var(--color-text-faint)] mt-1">
                  Use a ChipNet-compatible wallet (e.g. Electron Cash with chipnet). Get test BCH from{" "}
                  <a
                    href="https://tbch.googol.cash"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-brand)] hover:underline"
                  >
                    tbch.googol.cash
                  </a>
                </p>
              </div>

              {/* Txid input */}
              <div className="mb-4">
                <label className="text-xs text-[var(--color-text-faint)] uppercase tracking-wider block mb-1.5">
                  Transaction ID (after paying)
                </label>
                <input
                  type="text"
                  value={txidInput}
                  onChange={e => setTxidInput(e.target.value)}
                  placeholder="Paste your on-chain txid hereâ€¦"
                  className="w-full bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-[var(--color-brand)] transition-colors placeholder:text-[var(--color-text-faint)]"
                />
              </div>

              <button
                onClick={verifyAndAccess}
                disabled={!txidInput.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl
                           bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)] font-semibold
                           hover:bg-[var(--color-brand-light)]
                           disabled:opacity-40 disabled:cursor-not-allowed
                           transition-all duration-200 glow-sm hover:glow-md"
              >
                <CheckCircle className="w-4 h-4" />
                Verify Payment &amp; Get Access
              </button>
            </div>
          )}

          {/* Success result */}
          {phase === "done" && protectedBody && (
            <div className="glass rounded-xl p-5 mb-6 border border-[oklch(0.55_0.18_140/0.35)] animate-fade-in-up">
              <div className="flex items-center gap-2 text-[oklch(0.45_0.18_140)] font-semibold mb-3">
                <CheckCircle className="w-5 h-5" />
                Payment flow complete â€” protected resource returned
              </div>
              <pre className="text-xs font-mono bg-[var(--color-surface-alt)] rounded-xl p-4 overflow-x-auto text-[var(--color-text)]">
                {protectedBody}
              </pre>
              {token && (
                <p className="text-[10px] font-mono text-[var(--color-text-faint)] mt-3 break-all">
                  Access token: {token}
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {phase === "error" && errorMsg && (
            <div className="glass rounded-xl p-4 mb-6 border border-[oklch(0.55_0.22_25/0.4)] text-[oklch(0.55_0.22_25)] text-sm font-mono">
              {errorMsg}
            </div>
          )}

          {/* Start / Reset button */}
          {(phase === "idle" || phase === "error" || phase === "done") && (
            <button
              onClick={startFlow}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl
                         bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)] font-semibold
                         hover:bg-[var(--color-brand-light)]
                         transition-all duration-200 glow-sm hover:glow-md"
            >
              <Play className="w-4 h-4" />
              {phase === "idle" ? "Start Flow" : "Run Again"}
            </button>
          )}

          {/* Loading state button (non-interactive phases) */}
          {(phase === "fetching-challenge" || phase === "verifying" || phase === "accessing") && (
            <button
              disabled
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl
                         bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)] font-semibold
                         opacity-60 cursor-not-allowed"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              {phase === "fetching-challenge" ? "Fetching challengeâ€¦" :
               phase === "verifying"          ? "Verifying on-chainâ€¦" :
                                                "Accessing resourceâ€¦"}
            </button>
          )}

        </div>
      </main>
      <Footer />
    </div>
  );
}

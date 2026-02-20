"use client";

import { ArrowRight } from "lucide-react";

const PERCALL_STEPS = [
  {
    n: "01",
    title: "Client hits endpoint",
    body: "Client makes a request to a CashFlow402-protected route without a payment token.",
  },
  {
    n: "02",
    title: "Server returns 402",
    body: "Server responds with 402 Payment Required, including a BCH address, amount, and challenge nonce.",
  },
  {
    n: "03",
    title: "Client pays on BCH",
    body: "Client sends the exact BCH amount to the provided address. Transaction is broadcast to the network.",
  },
  {
    n: "04",
    title: "Client verifies with /pay/verify",
    body: "Client posts the on-chain txid and nonce. Server verifies the UTXO and issues a short-lived Bearer token.",
  },
  {
    n: "05",
    title: "Access granted (200)",
    body: "Client re-submits the original request with the Bearer token. Server validates and returns the protected resource.",
  },
];

const SUBSCRIPTION_STEPS = [
  {
    n: "01",
    title: "Subscriber creates contract",
    body: "Subscriber calls POST /subscriptions, funding a CashScript contract with BCH. The contract encodes authorization amount and interval.",
  },
  {
    n: "02",
    title: "Contract deployed on-chain",
    body: "A CashTokens-tagged UTXO represents the subscription. The token category ID is the subscription identifier.",
  },
  {
    n: "03",
    title: "Merchant claims every N blocks",
    body: "Merchant calls POST /subscriptions/:id/claim when N blocks have elapsed. The contract enforces the claim window.",
  },
  {
    n: "04",
    title: "Subscriber accesses API",
    body: "While the subscription is active, the subscriber can access protected endpoints by presenting their token.",
  },
];

function StepList({ steps }: { steps: typeof PERCALL_STEPS }) {
  return (
    <ol className="flex flex-col gap-5">
      {steps.map((step, i) => (
        <li key={step.n} className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-[var(--color-brand-glow)] border border-[var(--color-border-brand)] flex items-center justify-center">
            <span className="text-xs font-mono font-bold text-[var(--color-brand)]">{step.n}</span>
          </div>
          <div className="flex-1 pt-1">
            <h4 className="font-semibold text-sm mb-0.5">{step.title}</h4>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{step.body}</p>
          </div>
          {i < steps.length - 1 && (
            <ArrowRight className="hidden sm:block w-4 h-4 text-[var(--color-border)] shrink-0 mt-3" />
          )}
        </li>
      ))}
    </ol>
  );
}

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 border-t border-[var(--color-border)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">

        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 text-[var(--color-brand)] text-xs font-mono uppercase tracking-widest mb-4">
            How it works
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold font-[var(--font-space-grotesk)] text-gradient">
            Two payment modes
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Per-call */}
          <div className="glass rounded-2xl p-7 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-6">
              <span className="flex items-center justify-center px-3 py-1 rounded-lg bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)] text-xs font-bold">
                Per-call
              </span>
              <h3 className="font-bold font-[var(--font-space-grotesk)]">One-shot payments</h3>
            </div>
            <StepList steps={PERCALL_STEPS} />
          </div>

          {/* Subscription */}
          <div className="glass rounded-2xl p-7 animate-fade-in-up delay-200">
            <div className="flex items-center gap-3 mb-6">
              <span className="flex items-center justify-center px-3 py-1 rounded-lg bg-[var(--color-brand-glow)] border border-[var(--color-border-brand)] text-[var(--color-brand)] text-xs font-bold">
                Subscription
              </span>
              <h3 className="font-bold font-[var(--font-space-grotesk)]">Recurring on-chain</h3>
            </div>
            <StepList steps={SUBSCRIPTION_STEPS} />
          </div>

        </div>

      </div>
    </section>
  );
}

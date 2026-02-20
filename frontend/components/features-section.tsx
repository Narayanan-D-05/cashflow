"use client";

import { Zap, Repeat2, Shield, Code2, Boxes, Clock } from "lucide-react";

const FEATURES = [
  {
    icon: <Zap className="w-5 h-5" />,
    title: "Per-Call Payments",
    description:
      "Charge clients per HTTP request using Bitcoin Cash. No subscription, no login — just pay and access.",
    badge: "Core",
  },
  {
    icon: <Repeat2 className="w-5 h-5" />,
    title: "On-Chain Subscriptions",
    description:
      "CashScript smart contracts enforce periodic payments. Merchants claim funds every N blocks without requiring subscriber action.",
    badge: "Core",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    title: "Payment Verification",
    description:
      "UTXO-level on-chain verification via Electrum WSS. No centralized payment processor — the BCH chain is the source of truth.",
    badge: "Security",
  },
  {
    icon: <Code2 className="w-5 h-5" />,
    title: "HTTP 402 Native",
    description:
      "Built for the Web's forgotten status code. Any REST endpoint becomes a paid endpoint with a single Express middleware.",
    badge: "Protocol",
  },
  {
    icon: <Boxes className="w-5 h-5" />,
    title: "CashTokens-Ready",
    description:
      "Subscriptions are uniquely identified by CashToken category IDs, enabling on-chain metering and tamper-proof state.",
    badge: "BCH",
  },
  {
    icon: <Clock className="w-5 h-5" />,
    title: "Instant Settlement",
    description:
      "BCH 0-conf transactions give sub-second payment confirmation. No waiting for block confirmations for low-risk per-call access.",
    badge: "Speed",
  },
];

const BADGE_COLORS: Record<string, string> = {
  Core:     "bg-[var(--color-brand-glow)] text-[var(--color-brand)]",
  Security: "bg-[oklch(0.55_0.18_140/0.15)] text-[oklch(0.45_0.18_140)]",
  Protocol: "bg-[oklch(0.55_0.18_230/0.15)] text-[oklch(0.45_0.18_230)]",
  BCH:      "bg-[oklch(0.65_0.20_55/0.15)] text-[oklch(0.50_0.20_55)]",
  Speed:    "bg-[oklch(0.55_0.22_25/0.15)] text-[oklch(0.45_0.22_25)]",
};

export default function FeaturesSection() {
  return (
    <section id="features" className="py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">

        {/* Heading */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 text-[var(--color-brand)] text-xs font-mono uppercase tracking-widest mb-4">
            <Zap className="w-3 h-3" />
            What it does
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold font-[var(--font-space-grotesk)] text-gradient mb-3">
            Features
          </h2>
          <p className="text-[var(--color-text-muted)] max-w-xl mx-auto">
            Everything you need to add Bitcoin Cash payments to any HTTP API — per
            request or recurring.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={`glass rounded-2xl p-6 flex flex-col gap-3 hover:glow-sm transition-all duration-300 animate-fade-in-up`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--color-brand-glow)] text-[var(--color-brand)]">
                  {f.icon}
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BADGE_COLORS[f.badge] ?? "bg-[var(--color-surface-alt)]"}`}>
                  {f.badge}
                </span>
              </div>
              <h3 className="font-semibold font-[var(--font-space-grotesk)]">{f.title}</h3>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

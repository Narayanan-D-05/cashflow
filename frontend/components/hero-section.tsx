"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Zap, ArrowRight, Github } from "lucide-react";

const TYPEWRITER_WORDS = [
  "API Monetization",
  "Per-Call Payments",
  "BCH Subscriptions",
  "HTTP 402 Protocol",
  "Instant Micropayments",
];

export default function HeroSection() {
  const [wordIdx, setWordIdx] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [deleting, setDeleting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const target = TYPEWRITER_WORDS[wordIdx];

    if (!deleting && displayed.length < target.length) {
      timerRef.current = setTimeout(() => setDisplayed(target.slice(0, displayed.length + 1)), 60);
    } else if (!deleting && displayed.length === target.length) {
      timerRef.current = setTimeout(() => setDeleting(true), 1800);
    } else if (deleting && displayed.length > 0) {
      timerRef.current = setTimeout(() => setDisplayed(s => s.slice(0, -1)), 35);
    } else if (deleting && displayed.length === 0) {
      setDeleting(false);
      setWordIdx(i => (i + 1) % TYPEWRITER_WORDS.length);
    }

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [displayed, deleting, wordIdx]);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">

      {/* Ambient background blobs */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none"
        aria-hidden
      >
        <div
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 animate-float"
          style={{ background: "radial-gradient(circle, var(--color-brand) 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-3xl opacity-15 animate-float delay-300"
          style={{ background: "radial-gradient(circle, var(--color-brand-dark) 0%, transparent 70%)" }}
        />
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-32 text-center">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass border-brand text-xs font-mono uppercase tracking-widest text-[var(--color-brand)] mb-6 animate-fade-in-up">
          <Zap className="w-3 h-3" />
          HTTP 402 · Bitcoin Cash
        </div>

        {/* Logo */}
        <div className="flex justify-center mb-6 animate-fade-in-up delay-100">
          <Image src="/cashflow402.jpg" alt="CashFlow402 Logo" width={160} height={160} className="rounded-3xl shadow-[0_0_30px_rgba(255,160,0,0.3)] border border-[var(--color-brand)]/50" />
        </div>

        {/* Heading */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold font-[var(--font-space-grotesk)] leading-tight mb-6 animate-fade-in-up delay-100">
          <span className="text-gradient">CashFlow</span>
          <span className="text-[var(--color-brand)]">402</span>
        </h1>

        {/* Typewriter subtitle */}
        <div className="h-14 flex items-center justify-center mb-6 animate-fade-in-up delay-200">
          <p className="text-2xl sm:text-3xl font-[var(--font-space-grotesk)] text-[var(--color-text-muted)]">
            {displayed}
            <span className="inline-block w-0.5 h-7 bg-[var(--color-brand)] ml-0.5 animate-blink" />
          </p>
        </div>

        {/* Description */}
        <p className="text-lg text-[var(--color-text-muted)] max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up delay-300">
          An open protocol for monetizing any HTTP endpoint using Bitcoin Cash.
          Charge per API call or set up recurring subscriptions — all enforced
          on-chain with CashScript smart contracts.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up delay-400">
          <Link
            href="/demo"
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)] font-semibold glow-sm hover:glow-md hover:bg-[var(--color-brand-light)] transition-all duration-200"
          >
            Try the Demo
            <ArrowRight className="w-4 h-4" />
          </Link>

          <a
            href="https://github.com/Narayanan-D-05/cashflow"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 rounded-xl glass border-brand text-[var(--color-text)] hover:text-[var(--color-brand)] hover:glow-sm transition-all duration-200"
          >
            <Github className="w-4 h-4" />
            View on GitHub
          </a>
        </div>

        {/* Code snippet teaser */}
        <div className="mt-16 max-w-xl mx-auto glass rounded-2xl p-4 text-left animate-fade-in-up delay-500">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="w-3 h-3 rounded-full bg-[oklch(0.55_0.22_25)]" />
            <span className="w-3 h-3 rounded-full bg-[oklch(0.65_0.20_55)]" />
            <span className="w-3 h-3 rounded-full bg-[oklch(0.55_0.18_140)]" />
            <span className="ml-2 text-xs text-[var(--color-text-faint)] font-mono">HTTP 402 flow</span>
          </div>
          <pre className="text-xs font-mono overflow-x-auto leading-relaxed">
            <code><span className="text-[var(--color-text-faint)]"># 1. Hit protected endpoint → 402</span>
              <span className="text-[var(--color-brand)]">GET /api/data</span>  →  <span className="text-[oklch(0.65_0.20_55)]">402 Payment Required</span>
              <span className="text-[var(--color-text-faint)]">Payment-Address: bitcoincash:qr…</span>

              <span className="text-[var(--color-text-faint)]"># 2. Pay → verify → access</span>
              <span className="text-[var(--color-brand)]">POST /pay/verify</span>  →  <span className="text-[oklch(0.55_0.18_140)]">200 OK</span>  +  Bearer token
              <span className="text-[var(--color-brand)]">GET /api/data</span>  →  <span className="text-[oklch(0.55_0.18_140)]">200 OK</span>  ✓</code>
          </pre>
        </div>

      </div>
    </section>
  );
}

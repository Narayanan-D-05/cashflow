"use client";

import { useEffect, useState } from "react";
import Header from "@/components/header";
import Footer from "@/components/footer";
import CursorGlow from "@/components/cursor-glow";
import { api, type SubscriptionRecord } from "@/lib/api";
import { Activity, Coins, RefreshCw, AlertCircle } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "text-[oklch(0.55_0.18_140)]",
  paused: "text-[oklch(0.65_0.20_55)]",
  expired: "text-[oklch(0.55_0.22_25)]",
  cancelled: "text-[oklch(0.55_0.22_25)]",
};

const STATUS_BADGES: Record<string, string> = {
  active: "bg-[oklch(0.55_0.18_140/0.15)] border-[oklch(0.55_0.18_140/0.4)] text-[oklch(0.45_0.18_140)]",
  paused: "bg-[oklch(0.65_0.20_55/0.15)]  border-[oklch(0.65_0.20_55/0.4)]  text-[oklch(0.50_0.20_55)]",
  expired: "bg-[oklch(0.55_0.22_25/0.15)]  border-[oklch(0.55_0.22_25/0.4)]  text-[oklch(0.45_0.22_25)]",
  cancelled: "bg-[oklch(0.55_0.22_25/0.15)]  border-[oklch(0.55_0.22_25/0.4)]  text-[oklch(0.45_0.22_25)]",
};

function SubscriptionCard({ sub }: { sub: SubscriptionRecord }) {
  const sats = Number(sub.balance);
  const authorized = Number(sub.authorizedSats);
  const pct = authorized > 0 ? Math.min(100, Math.round((sats / authorized) * 100)) : 0;
  const badge = STATUS_BADGES[sub.status] ?? STATUS_BADGES.expired;

  return (
    <div className="glass rounded-xl p-5 flex flex-col gap-4 hover:glow-sm transition-all duration-300">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-[var(--color-text-muted)] truncate">
            {sub.contractAddress}
          </p>
          <p className="text-xs text-[var(--color-text-faint)] mt-0.5 truncate">
            Category: {sub.tokenCategory}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${badge}`}>
          {sub.status}
        </span>
      </div>

      {/* Balance bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5 text-xs">
          <span className="text-[var(--color-text-muted)]">Balance</span>
          <span className="font-mono font-semibold">
            {sats.toLocaleString()} <span className="text-[var(--color-brand)]">sats</span>
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--color-surface-alt)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-brand)] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-[var(--color-text-faint)] mt-1">
          <span>0</span>
          <span>{authorized.toLocaleString()} sats authorized</span>
        </div>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-[var(--color-text-faint)]">Interval</span>
          <p className="font-mono">{sub.intervalBlocks} blocks</p>
        </div>
        <div>
          <span className="text-[var(--color-text-faint)]">Last claim</span>
          <p className="font-mono">block {sub.lastClaimBlock}</p>
        </div>
        <div>
          <span className="text-[var(--color-text-faint)]">Subscriber</span>
          <p className="font-mono truncate">{sub.subscriberAddress.slice(0, 20)}…</p>
        </div>
        <div>
          <span className="text-[var(--color-text-faint)]">Created</span>
          <p className="font-mono">{new Date(sub.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Action buttons */}
      {sub.status === "active" && (
        <div className="flex gap-2 mt-2 pt-4 border-t border-[var(--glass-border)]">
          <button
            onClick={() => window.open(`http://localhost:3002/?tokenCategory=${sub.tokenCategory}`, "_blank")}
            className="flex-1 rounded-lg border border-[var(--color-brand)] text-[var(--color-brand)] hover:bg-[var(--color-brand)]/10 px-3 py-2 text-xs font-semibold transition-all text-center"
          >
            Test API (Demo App)
          </button>
          <button
            onClick={() => window.location.href = `/merchant?contractAddress=${sub.contractAddress}&tokenCategory=${sub.tokenCategory}`}
            className="flex-1 rounded-lg border border-[var(--glass-border)] bg-[var(--color-surface-alt)] hover:bg-[var(--color-surface-alt)]/80 text-[var(--color-text)] px-3 py-2 text-xs font-semibold transition-all text-center"
          >
            Withdraw (Claim)
          </button>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [subs, setSubs] = useState<SubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAllSubscriptions();
      setSubs(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const counts = {
    active: subs.filter(s => s.status === "active").length,
    paused: subs.filter(s => s.status === "paused").length,
    expired: subs.filter(s => s.status === "expired" || s.status === "cancelled").length,
    totalSats: subs.reduce((n, s) => n + Number(s.balance), 0),
  };

  return (
    <div className="relative min-h-screen flex flex-col">
      <CursorGlow />
      <Header />
      <main className="flex-1 pt-24 pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">

          {/* Page heading */}
          <div className="mb-8 animate-fade-in-up">
            <h1 className="text-3xl font-bold font-[var(--font-space-grotesk)] text-gradient mb-2">
              Subscription Dashboard
            </h1>
            <p className="text-[var(--color-text-muted)]">
              All active payment subscriptions registered with this CashFlow402 node.
            </p>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 animate-fade-in-up delay-100">
            {[
              { label: "Active", value: counts.active, icon: <Activity className="w-4 h-4" /> },
              { label: "Paused", value: counts.paused, icon: <Activity className="w-4 h-4" /> },
              { label: "Expired", value: counts.expired, icon: <AlertCircle className="w-4 h-4" /> },
              { label: "Total sats", value: counts.totalSats.toLocaleString(), icon: <Coins className="w-4 h-4" /> },
            ].map(tile => (
              <div key={tile.label} className="glass rounded-xl p-4 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[var(--color-brand)] text-xs">
                  {tile.icon}
                  <span className="uppercase tracking-wider font-medium">{tile.label}</span>
                </div>
                <p className="text-2xl font-bold font-mono">{tile.value}</p>
              </div>
            ))}
          </div>

          {/* Refresh button */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-[var(--color-text-muted)]">
              {subs.length} subscription{subs.length !== 1 ? "s" : ""}
            </p>
            <button
              onClick={load}
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg glass hover:border-brand transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin-slow" : ""}`} />
              Refresh
            </button>
          </div>

          {/* Content */}
          {error && (
            <div className="glass rounded-xl p-6 text-center text-[oklch(0.55_0.22_25)]">
              <AlertCircle className="w-8 h-8 mx-auto mb-3" />
              <p className="font-mono text-sm">{error}</p>
              <p className="text-xs mt-2 text-[var(--color-text-muted)]">
                Make sure the CashFlow402 backend is running on{" "}
                <code className="bg-[var(--color-surface-alt)] px-1 rounded">localhost:3000</code>
              </p>
            </div>
          )}

          {!error && loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass rounded-xl p-5 h-48 animate-pulse" />
              ))}
            </div>
          )}

          {!error && !loading && subs.length === 0 && (
            <div className="glass rounded-xl p-12 text-center">
              <Coins className="w-12 h-12 mx-auto mb-4 text-[var(--color-brand)] opacity-40" />
              <p className="text-[var(--color-text-muted)]">No subscriptions yet.</p>
              <p className="text-sm text-[var(--color-text-faint)] mt-1">
                Subscriptions will appear here once a subscriber calls{" "}
                <code className="bg-[var(--color-surface-alt)] px-1 rounded">
                  POST /subscriptions
                </code>
              </p>
            </div>
          )}

          {!error && !loading && subs.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {subs.map(s => (
                <SubscriptionCard key={s.contractAddress} sub={s} />
              ))}
            </div>
          )}

        </div>
      </main>
      <Footer />
    </div>
  );
}

import Link from "next/link";
import { Github, Zap } from "lucide-react";

const LINKS = [
  { label: "Home", href: "/" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Demo", href: "/demo" },
  { label: "API Docs", href: "http://localhost:3000/docs", external: true },
  { label: "GitHub", href: "https://github.com/Narayanan-D-05/cashflow", external: true },
];

export default function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)] mt-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">

        {/* Brand */}
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)]">
            <Zap className="w-3.5 h-3.5" />
          </span>
          <span className="font-bold font-[var(--font-space-grotesk)]">
            CashFlow<span className="text-[var(--color-brand)]">402</span>
          </span>
        </div>

        {/* Links */}
        <nav className="flex flex-wrap items-center justify-center gap-4">
          {LINKS.map(l =>
            l.external ? (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-brand)] transition-colors"
              >
                {l.label}
              </a>
            ) : (
              <Link
                key={l.label}
                href={l.href}
                className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-brand)] transition-colors"
              >
                {l.label}
              </Link>
            )
          )}
        </nav>

        {/* Credit */}
        <p className="text-xs text-[var(--color-text-faint)] text-center">
          Forged with ❤️ &amp; BCH
        </p>
      </div>
    </footer>
  );
}

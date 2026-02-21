"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Zap, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { href: "/",              label: "Home"         },
  { href: "/dashboard",     label: "Dashboard"    },
  { href: "/demo",          label: "Per-call Demo" },
  { href: "/subscription",  label: "Subscription" },
  { href: "http://localhost:3000/docs", label: "API Docs", external: true },
];

export default function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled]     = useState(false);
  const [menuOpen, setMenuOpen]     = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled || menuOpen
          ? "glass border-b border-[var(--color-border)]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)] group-hover:glow-md transition-all duration-200">
            <Zap className="w-4 h-4" />
          </span>
          <span className="font-bold text-lg font-[var(--font-space-grotesk)] group-hover:text-gradient transition-all">
            CashFlow<span className="text-[var(--color-brand)]">402</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(link => {
            const active = !link.external && pathname === link.href;
            return link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg text-sm text-[var(--color-text-muted)] hover:text-[var(--color-brand)] hover:bg-[var(--color-surface-alt)] transition-all duration-200"
              >
                {link.label} ↗
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
                  active
                    ? "text-[var(--color-brand)] bg-[var(--color-brand-glow)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-brand)] hover:bg-[var(--color-surface-alt)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-brand)] hover:bg-[var(--color-surface-alt)] transition-all"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-[var(--color-border)] px-4 pb-4 pt-2 flex flex-col gap-1">
          {NAV_LINKS.map(link =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-sm text-[var(--color-text-muted)] hover:text-[var(--color-brand)] hover:bg-[var(--color-surface-alt)] transition-all"
              >
                {link.label} ↗
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`px-3 py-2 rounded-lg text-sm transition-all ${
                  pathname === link.href
                    ? "text-[var(--color-brand)] bg-[var(--color-brand-glow)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-brand)] hover:bg-[var(--color-surface-alt)]"
                }`}
              >
                {link.label}
              </Link>
            )
          )}
        </div>
      )}
    </header>
  );
}

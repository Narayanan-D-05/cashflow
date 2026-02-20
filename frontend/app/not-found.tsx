import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <p className="text-[var(--color-brand)] text-xs font-mono uppercase tracking-widest">
        404
      </p>
      <h1 className="text-4xl font-bold text-gradient font-[var(--font-space-grotesk)]">
        Page not found
      </h1>
      <p className="text-[var(--color-text-muted)] text-center max-w-sm">
        The route you&apos;re looking for doesn&apos;t exist — maybe it requires a payment first?
      </p>
      <Link
        href="/"
        className="px-5 py-2 rounded-xl bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)] font-semibold hover:bg-[var(--color-brand-light)] transition-all"
      >
        Go home
      </Link>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold text-gradient font-[var(--font-space-grotesk)]">
        Something went wrong
      </h1>
      <p className="text-[var(--color-text-muted)] font-mono text-sm max-w-md text-center">
        {error.message}
      </p>
      <div className="flex gap-4">
        <button
          onClick={reset}
          className="px-5 py-2 rounded-xl bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)] font-semibold hover:bg-[var(--color-brand-light)] transition-all"
        >
          Try again
        </button>
        <Link
          href="/"
          className="px-5 py-2 rounded-xl glass border-brand text-[var(--color-text)] hover:text-[var(--color-brand)] transition-all"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

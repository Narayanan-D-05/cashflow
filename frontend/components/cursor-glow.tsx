"use client";

import { useEffect, useRef } from "react";

export default function CursorGlow() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = glowRef.current;
    if (!el) return;

    let req: number;

    function onMove(e: MouseEvent) {
      cancelAnimationFrame(req);
      req = requestAnimationFrame(() => {
        if (!el) return;
        el.style.left = `${e.clientX}px`;
        el.style.top  = `${e.clientY}px`;
        el.style.opacity = "1";
      });
    }

    function onLeave() {
      if (el) el.style.opacity = "0";
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(req);
    };
  }, []);

  return (
    <div
      ref={glowRef}
      aria-hidden
      className="pointer-events-none fixed z-0 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-300"
      style={{
        width: "600px",
        height: "600px",
        borderRadius: "50%",
        background: "radial-gradient(circle, var(--color-brand-glow) 0%, transparent 70%)",
        filter: "blur(2px)",
      }}
    />
  );
}

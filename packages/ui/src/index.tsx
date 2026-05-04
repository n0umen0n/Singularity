import type { ComponentPropsWithoutRef, ReactNode } from "react";

export function SingularityMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">
        <path d="M11 10 C22 23 25 27 32 32 C39 37 42 41 53 54" stroke="#ff7a5f" />
        <path d="M53 10 C42 23 39 27 32 32 C25 37 22 41 11 54" stroke="#8f7cff" />
        <path d="M20 11 C28 24 29 40 20 53" stroke="#8f7cff" />
        <path d="M44 11 C36 24 35 40 44 53" stroke="#ff7a5f" />
        <ellipse cx="32" cy="10" rx="21" ry="4.6" stroke="#ff7a5f" />
        <ellipse cx="32" cy="16" rx="15" ry="3.2" stroke="#ff7a5f" opacity="0.85" />
        <ellipse cx="32" cy="32" rx="5.2" ry="2" stroke="#fff7ed" opacity="0.82" />
        <ellipse cx="32" cy="48" rx="15" ry="3.2" stroke="#8f7cff" opacity="0.85" />
        <ellipse cx="32" cy="54" rx="21" ry="4.6" stroke="#8f7cff" />
      </g>
    </svg>
  );
}

export function BrandWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-wordmark ${className}`.trim()} aria-label="Singularity">
      <SingularityMark className="brand-mark" />
      <span>Singularity</span>
    </span>
  );
}

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function GlassCard({
  className = "",
  children,
  ...props
}: ComponentPropsWithoutRef<"section"> & { children: ReactNode }) {
  return (
    <section className={`glass-card ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

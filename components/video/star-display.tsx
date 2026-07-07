import { cn } from "@/lib/cn";

export function StarDisplay({
  avg,
  count,
  className,
}: {
  avg: number | null;
  count?: number;
  className?: string;
}) {
  if (avg == null) {
    return (
      <span className={cn("text-xs text-cream/40", className)}>Not rated yet</span>
    );
  }
  const rounded = Math.round(avg);
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs", className)}
      title={`${avg.toFixed(1)} out of 5`}
    >
      <span aria-hidden className="tracking-tight">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={i <= rounded ? "text-osc-star" : "text-white/20"}>
            ★
          </span>
        ))}
      </span>
      <span className="font-bold text-cream/80">{avg.toFixed(1)}</span>
      {count != null ? <span className="text-cream/40">({count})</span> : null}
    </span>
  );
}

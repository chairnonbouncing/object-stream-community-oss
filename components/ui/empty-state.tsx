export function EmptyState({
  emoji = "📺",
  title,
  hint,
  children,
}: {
  emoji?: string;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-line bg-surface/50 px-6 py-14 text-center">
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      <p className="font-display text-xl text-cream">{title}</p>
      {hint ? <p className="max-w-md text-sm text-cream/60">{hint}</p> : null}
      {children}
    </div>
  );
}

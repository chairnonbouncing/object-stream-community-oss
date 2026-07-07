import Link from "next/link";

export function SectionHeading({
  title,
  href,
  linkLabel = "See all",
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="font-display text-2xl tracking-wide text-cream sm:text-3xl">
        {title}
      </h2>
      {href ? (
        <Link
          href={href}
          className="whitespace-nowrap text-sm font-bold text-osc-blue hover:underline"
        >
          {linkLabel} →
        </Link>
      ) : null}
    </div>
  );
}

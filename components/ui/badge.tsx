import { cn } from "@/lib/cn";

export type BadgeColor = "yellow" | "purple" | "red" | "blue" | "green" | "neutral";

const colorClasses: Record<BadgeColor, string> = {
  yellow: "border-osc-star/70 text-osc-star",
  purple: "border-osc-purple/80 text-[#b795ff]",
  red: "border-osc-red/70 text-osc-red",
  blue: "border-osc-blue/70 text-osc-blue",
  green: "border-osc-green/70 text-osc-green",
  neutral: "border-white/25 text-cream/70",
};

export function Badge({
  color = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { color?: BadgeColor }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border-2 px-2.5 py-0.5 text-xs font-bold",
        colorClasses[color],
        className
      )}
      {...props}
    />
  );
}

const chipPalette: BadgeColor[] = ["yellow", "purple", "red", "blue", "green"];

/** Stable color for a tag name, cycling the mockup's chip palette. */
export function tagColor(tag: string): BadgeColor {
  let sum = 0;
  for (const ch of tag) sum = (sum + ch.charCodeAt(0)) % 997;
  return chipPalette[sum % chipPalette.length];
}

import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "accent" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary: "bg-white text-night hover:bg-cream",
  accent: "bg-osc-purple text-white hover:brightness-110",
  ghost: "bg-white/10 text-cream hover:bg-white/15",
  outline: "border border-white/40 text-cream hover:bg-white/10",
  danger: "bg-osc-red/90 text-white hover:bg-osc-red",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

const base =
  "inline-flex items-center justify-center rounded-full font-bold transition " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-osc-purple " +
  "disabled:pointer-events-none disabled:opacity-50";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(base, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  href,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link
      href={href}
      className={cn(base, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    />
  );
}

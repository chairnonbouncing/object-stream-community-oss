import { cn } from "@/lib/cn";
import { forwardRef } from "react";

const controlClasses =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-cream " +
  "placeholder:text-cream/35 focus:border-osc-purple focus:outline-none " +
  "focus:ring-2 focus:ring-osc-purple/40";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(controlClasses, className)} {...props} />;
  }
);

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return (
    <select ref={ref} className={cn(controlClasses, "appearance-none", className)} {...props} />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea ref={ref} className={cn(controlClasses, "min-h-24", className)} {...props} />
  );
});

export function Field({
  label,
  htmlFor,
  hint,
  errors,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  errors?: string[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-bold text-cream/85">
        {label}
        {hint ? <span className="ml-2 font-normal text-cream/40">{hint}</span> : null}
      </label>
      {children}
      {errors?.length ? (
        <p className="text-sm text-osc-red">{errors.join(" · ")}</p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-xl border border-osc-red/40 bg-osc-red/10 px-3.5 py-2.5 text-sm text-osc-red">
      {message}
    </p>
  );
}

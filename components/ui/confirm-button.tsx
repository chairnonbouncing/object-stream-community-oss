"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Submit button that arms on first click and only submits on the second,
 * used for destructive actions inside server-action forms.
 */
export function ConfirmButton({
  children,
  confirmLabel = "Sure?",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { confirmLabel?: string }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!armed) {
          e.preventDefault();
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 3000);
        }
      }}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-bold transition",
        armed
          ? "bg-osc-red text-white"
          : "border border-osc-red/50 text-osc-red hover:bg-osc-red/10",
        className
      )}
      {...props}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

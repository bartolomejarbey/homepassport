import { cn } from "@/lib/utils/cn";
import { ComponentProps, forwardRef } from "react";
export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(
      "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink",
      "outline-none focus:border-navy focus:ring-2 focus:ring-navy/15", className)} {...props} />;
  });

import { cn } from "@/lib/utils/cn";
import { ComponentProps } from "react";

type Variant = "primary" | "honey" | "ghost";
export function Button({ variant = "primary", className, ...props }:
  ComponentProps<"button"> & { variant?: Variant }) {
  const v = { primary: "btn-primary", honey: "btn-honey", ghost: "btn-ghost" }[variant];
  return <button className={cn("btn", v, "text-sm disabled:opacity-50", className)} {...props} />;
}

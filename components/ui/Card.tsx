import { cn } from "@/lib/utils/cn";
import { ComponentProps } from "react";
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("card p-5", className)} {...props} />;
}

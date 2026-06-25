"use client";
// Sidebar — calm, active-link-aware navigation for the authenticated app shell.
// Shares its nav model with the mobile drawer (see nav-items.ts) so they stay in sync.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { PRIMARY_NAV, SECONDARY_NAV, isNavActive } from "./nav-items";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  const linkClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      active
        ? "bg-navy text-white"
        : "text-ink-soft hover:bg-surface-2 hover:text-ink",
    );

  const renderItem = ({ href, label, icon: Icon }: (typeof PRIMARY_NAV)[number]) => {
    const active = isNavActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={linkClass(active)}
      >
        <Icon size={18} className={active ? "text-honey" : "text-muted"} />
        {label}
      </Link>
    );
  };

  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Hlavní navigace">
      {PRIMARY_NAV.map(renderItem)}

      <div className="my-2 border-t border-line" />

      {SECONDARY_NAV.map(renderItem)}
    </nav>
  );
}

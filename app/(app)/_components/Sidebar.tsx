"use client";
// Sidebar — calm, active-link-aware navigation for the authenticated app shell.
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Home,
  FileText,
  Package,
  BellRing,
  Search,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const nav = [
  { href: "/prehled", label: "Přehled", icon: LayoutDashboard },
  { href: "/nemovitost", label: "Nemovitost", icon: Home },
  { href: "/dokumenty", label: "Dokumenty", icon: FileText },
  { href: "/majetek", label: "Majetek", icon: Package },
  { href: "/pripominky", label: "Připomínky", icon: BellRing },
  { href: "/hledat", label: "Hledat", icon: Search },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const linkClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      active
        ? "bg-navy text-white"
        : "text-ink-soft hover:bg-surface-2 hover:text-ink",
    );

  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Hlavní navigace">
      {nav.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={linkClass(active)}
          >
            <Icon size={18} className={active ? "text-honey" : "text-muted"} />
            {label}
          </Link>
        );
      })}

      <div className="my-2 border-t border-line" />

      <Link
        href="/pro"
        aria-current={isActive("/pro") ? "page" : undefined}
        className={linkClass(isActive("/pro"))}
      >
        <Building2
          size={18}
          className={isActive("/pro") ? "text-honey" : "text-muted"}
        />
        Pro firmy
      </Link>
    </nav>
  );
}

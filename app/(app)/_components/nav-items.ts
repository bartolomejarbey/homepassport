// Shared navigation model for the authenticated shell — used by both the desktop
// Sidebar and the mobile drawer so the two never drift apart.
import {
  LayoutDashboard,
  Home,
  FileText,
  Package,
  BellRing,
  Search,
  Building2,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

// Primary, day-to-day navigation.
export const PRIMARY_NAV: NavItem[] = [
  { href: "/prehled", label: "Přehled", icon: LayoutDashboard },
  { href: "/nemovitost", label: "Nemovitost", icon: Home },
  { href: "/dokumenty", label: "Dokumenty", icon: FileText },
  { href: "/majetek", label: "Majetek", icon: Package },
  { href: "/pripominky", label: "Připomínky", icon: BellRing },
  { href: "/hledat", label: "Hledat", icon: Search },
];

// Secondary section (separated by a divider in the UI).
export const SECONDARY_NAV: NavItem[] = [
  { href: "/pro", label: "Pro firmy", icon: Building2 },
];

// Active-link matcher shared by both navigations.
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

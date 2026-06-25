"use client";
// MobileNav — hamburger + slide-over drawer for screens below md, where the
// sticky sidebar is hidden. Reuses the same Sidebar (and thus the same nav model),
// closes on navigation, Escape and backdrop tap, and locks body scroll while open.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Sidebar } from "./Sidebar";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Defensive: also close if the route changes for any reason while open.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock background scroll + close on Escape while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Otevřít navigaci"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Menu size={20} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        >
          <div
            className="absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col border-r border-line bg-surface"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Navigace"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
              <span className="font-display text-base font-semibold text-ink">
                Navigace
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Zavřít navigaci"
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Sidebar onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

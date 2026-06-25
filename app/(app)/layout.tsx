// Authenticated app shell — server-side auth gate, header with logo + sign-out, sidebar.
import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "./_components/Sidebar";
import { MobileNav } from "./_components/MobileNav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) redirect("/prihlaseni");

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <MobileNav />
            <Link href="/prehled" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-navy">
              <KeyRound size={18} className="text-honey" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-ink">
              Home Passport
            </span>
            </Link>
          </div>

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <LogOut size={16} className="text-muted" />
              Odhlásit se
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl px-4 sm:px-6">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-line md:block">
          <Sidebar />
        </aside>

        <main className="min-w-0 flex-1 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}

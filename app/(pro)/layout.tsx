// B2B (pro) shell — branded, honey-accented header shared by the console AND the
// public pilot-request page (/pro/poptavka). The auth GATE lives one level down in
// pro/(console)/layout.tsx, so prospective firms can reach the sales page without
// an account. Distinct from the consumer app shell: builder-facing, so the accent
// is honey, not navy.
import Link from "next/link";
import { Building2, LayoutDashboard, FolderKanban, ArrowLeft, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Pro firmy — Home Passport" };

export default async function ProLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 border-b border-line bg-navy text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/pro" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-honey">
              <Building2 size={18} className="text-navy-900" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-display text-lg font-semibold tracking-tight text-white">
                Home Passport
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-honey">
                Pro firmy
              </span>
            </span>
          </Link>

          {user ? (
            <>
              <nav className="hidden items-center gap-1 sm:flex" aria-label="Konzole">
                <Link
                  href="/pro"
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <LayoutDashboard size={16} className="text-honey" />
                  Přehled
                </Link>
                <Link
                  href="/pro/nemovitosti"
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <FolderKanban size={16} className="text-honey" />
                  Nemovitosti
                </Link>
              </nav>

              <div className="flex items-center gap-1">
                <Link
                  href="/prehled"
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <ArrowLeft size={15} className="text-honey" />
                  <span className="hidden sm:inline">Moje domácnost</span>
                </Link>
                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label="Odhlásit se"
                  >
                    <LogOut size={16} className="text-honey" />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/prihlaseni?next=/pro"
                className="rounded-md px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                Přihlásit
              </Link>
              <Link
                href="/registrace"
                className="rounded-md bg-honey px-3 py-2 text-sm font-semibold text-navy-900 transition-colors hover:bg-honey-100"
              >
                Vyzkoušet
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-10">{children}</main>
    </div>
  );
}

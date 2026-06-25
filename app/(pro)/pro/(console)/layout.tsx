// Console gate — auth-only wrapper for the B2B dashboard and property list.
// Lives below the shared (pro) chrome so the public /pro/poptavka sales page can
// sit in the same group WITHOUT being forced through login. Prospective firms
// must be able to request a pilot before they have an account.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ProConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) redirect("/prihlaseni?next=/pro");

  return <>{children}</>;
}

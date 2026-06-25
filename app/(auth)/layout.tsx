// app/(auth)/layout.tsx — centered, branded shell for the login & signup pages.
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-10">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 self-start">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-navy text-honey">
            <KeyRound size={17} />
          </span>
          <span className="font-display text-lg font-semibold text-ink">
            Home Passport
          </span>
        </Link>

        {/* Card */}
        <div className="flex flex-1 flex-col justify-center py-10">
          <div className="card p-7">{children}</div>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted">
            <ShieldCheck size={13} className="text-teal" />
            Data uložená v EU · šifrováno · bez sdílení třetím stranám.
          </p>
        </div>
      </div>
    </main>
  );
}

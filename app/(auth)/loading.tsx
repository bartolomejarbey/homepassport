// app/(auth)/loading.tsx — skeleton shown while the auth pages resolve their
// server-side session check. The (auth) layout already renders the card shell and
// brand, so this only fills the card body — preventing a blank flash on slow auth.
export default function AuthLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Načítání…</span>

      {/* Heading + subheading */}
      <div className="h-7 w-2/3 rounded-md bg-surface-2" />
      <div className="mt-3 h-4 w-11/12 rounded-md bg-surface-2" />

      {/* Two input fields */}
      <div className="mt-8 space-y-4">
        <div>
          <div className="mb-2 h-3.5 w-20 rounded bg-surface-2" />
          <div className="h-9 w-full rounded-md bg-surface-2" />
        </div>
        <div>
          <div className="mb-2 h-3.5 w-16 rounded bg-surface-2" />
          <div className="h-9 w-full rounded-md bg-surface-2" />
        </div>
      </div>

      {/* Submit button + footer link */}
      <div className="mt-6 h-9 w-full rounded-md bg-navy/70" />
      <div className="mx-auto mt-5 h-4 w-1/2 rounded bg-surface-2" />
    </div>
  );
}

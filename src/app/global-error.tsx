"use client";

import "./globals.css";

/** Last-resort boundary when the root layout itself fails. No i18n available here. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground flex min-h-dvh items-center justify-center p-6 font-sans">
        <div className="grid max-w-sm gap-3 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground text-sm">Please try again. If it keeps happening, contact support.</p>
          {error.digest ? <p className="text-muted-foreground font-mono text-xs">Ref: {error.digest}</p> : null}
          <button
            onClick={reset}
            className="bg-primary text-primary-foreground mx-auto rounded-md px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

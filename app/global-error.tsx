"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body className="bg-[#050208] text-white flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-white/50 text-sm">
            The error has been reported automatically.
          </p>
          <button
            onClick={reset}
            className="px-6 py-2.5 text-sm font-bold rounded-xl bg-gradient-to-r from-[#e879f9] to-[#f472b6] text-white hover:opacity-90 transition-opacity"
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}

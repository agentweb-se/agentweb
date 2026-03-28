"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <h2>Something went wrong</h2>
            <p>{error.message}</p>
            <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px" }}>
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

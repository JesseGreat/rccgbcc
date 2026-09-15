"use client";

// Last-resort boundary (the root layout itself failed), so no app CSS is guaranteed.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-NG">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          background: "#f4f4f7",
          color: "#1a1a1a",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <main>
          <h1 style={{ fontSize: "1.5rem" }}>Something went wrong</h1>
          <p style={{ color: "#5f6168", fontSize: "1.1rem" }}>Please try again in a moment.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              height: "3.5rem",
              padding: "0 2rem",
              border: 0,
              borderRadius: "1rem",
              background: "#1b3a6b",
              color: "#ffffff",
              fontSize: "1.2rem",
              fontWeight: 700,
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

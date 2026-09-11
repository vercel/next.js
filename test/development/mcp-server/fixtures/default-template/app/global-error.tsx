'use client'

export default function GlobalError({ error }: { error: unknown }) {
  return (
    <html>
      <body>
        <p id="global-error-fallback">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </body>
    </html>
  )
}

'use client'

export default function GlobalError({ error }) {
  return (
    <html>
      <head></head>
      <body>
        <h1>Global Error</h1>
        <p id="error">{`Global error: ${error?.message}`}</p>
        {error?.digest && <p id="digest">{error?.digest}</p>}
      </body>
    </html>
  )
}

// for inspecting purpose
GlobalError.displayName = 'GlobalError'

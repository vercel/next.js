'use client'

export default function GlobalError({ error }) {
  return (
    <html>
      <head>
        <title>500: Internal Server Error</title>
      </head>
      <body>
        <div
          style={{
            fontFamily: 'system-ui, sans-serif',
            height: '100vh',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <h1>500</h1>
          <h2>Global Error</h2>
          <p id="error">{`Global error: ${error?.message || 'Internal Server Error'}`}</p>
          {error?.digest && (
            <p id="digest">{error?.digest || 'nextjs-app-error-digest'}</p>
          )}
        </div>
      </body>
    </html>
  )
}

// for inspecting purpose
GlobalError.displayName = 'GlobalError'

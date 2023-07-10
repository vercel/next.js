'use client'

export default function GlobalError({ error }) {
  return (
    <html>
      <head></head>
      <body>
        <h1>Global Error</h1>
        <div id="error">{`Global error: ${error?.message}`}</div>
      </body>
    </html>
  )
}

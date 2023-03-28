'use client'

export default function GlobalError({ error }) {
  return (
    <html>
      <head></head>
      <body>
        <div id="error">{`Error message: ${error?.message}`}</div>
      </body>
    </html>
  )
}

// (patched in tests)
// export const runtime = 'REPLACE_ME'

export default function AppLayout({ children }) {
  return (
    <html>
      <head>
        <title>after</title>
      </head>
      <body>{children}</body>
    </html>
  )
}

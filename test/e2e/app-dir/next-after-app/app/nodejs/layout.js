export const runtime = 'nodejs'

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

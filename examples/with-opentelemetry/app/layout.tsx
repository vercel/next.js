export default function Layout({ children }) {
  return (
    <html>
      <head>
        <title>Next.js with OpenTelemetry</title>
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}

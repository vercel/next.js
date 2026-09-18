export default function Root({
  children,
  refresh,
  reset,
  refresherrorboundary,
}: {
  children: React.ReactNode
  refresh: React.ReactNode
  refresherrorboundary: React.ReactNode
  reset: React.ReactNode
}) {
  return (
    <html>
      <body>
        <ol>
          <li>{refresh}</li>
          <li>{refresherrorboundary}</li>
          <li>{reset}</li>
        </ol>
        <main>{children}</main>
      </body>
    </html>
  )
}

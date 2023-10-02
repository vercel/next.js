export default function Root({
  children,
  refresh,
  reset,
}: {
  children: React.ReactNode
  refresh: React.ReactNode
  reset: React.ReactNode
}) {
  return (
    <html>
      <body>
        <nav>
          {refresh}
          {reset}
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <header style={{ padding: '20px', background: '#f0f0f0' }}>
          <h1>Test App</h1>
          <nav>
            <a href="/" style={{ marginRight: '10px' }}>
              Home
            </a>
            <a href="/dynamic" style={{ marginRight: '10px' }}>
              Dynamic
            </a>
            <a href="/navigation-target" style={{ marginRight: '10px' }}>
              Nav Target
            </a>
            <a href="/other">Other</a>
          </nav>
        </header>
        <main style={{ padding: '20px' }}>{children}</main>
      </body>
    </html>
  )
}

// The ROOT layout is intentionally clean (static): it must stay shell-safe so
// every route — and Next's internal /_not-found and /_global-error pages — can
// prerender. A top-level request read here would gate the WHOLE app out of the
// shell. The dynamic-IO defects to fix live in the nested layouts/pages.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <header>
          <a href="/">Home</a> · <a href="/search">Search</a> ·{' '}
          <a href="/dashboard">Dashboard</a> ·{' '}
          <a href="/blog/hello-world">Blog</a>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}

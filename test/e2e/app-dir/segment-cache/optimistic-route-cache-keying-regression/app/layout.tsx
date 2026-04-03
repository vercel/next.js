export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: 20 }}>
          <h1>Route Cache Keying Regression Test</h1>
          <p style={{ color: '#666', fontSize: 14 }}>
            Reproduces a bug where navigating to an unprefetched route stored
            the route cache entry with an incorrect key, causing subsequent
            prefetches to the same URL to miss the cache and make redundant
            requests. See{' '}
            <a href="https://github.com/vercel/next.js/pull/88863">#88863</a>.
          </p>
          <p style={{ color: '#666', fontSize: 14 }}>
            This test relies on the staleTimes feature to keep route cache
            entries alive across navigations. The client cache currently only
            writes segment data during prefetches, not navigations, so
            staleTimes is needed to preserve the entries for reuse. Once
            navigation-time caching is supported more broadly, this test could
            use a simpler pattern.
          </p>
          <hr />
          {children}
        </div>
      </body>
    </html>
  )
}

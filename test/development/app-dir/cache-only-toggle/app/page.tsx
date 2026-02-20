import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1 data-testid="home-title">Instant Navigation Mode Demo</h1>
      <p>
        This fixture tests the <strong>Instant Navigation Mode</strong> toggle
        in Next.js Dev Tools. When enabled, navigations show only the cached or
        prefetched state — dynamic data is not streamed.
      </p>
      <h2>How to test</h2>
      <ol>
        <li>
          Open <strong>Next.js Dev Tools</strong> (click the Next.js logo in the
          corner).
        </li>
        <li>
          Toggle <strong>Instant Navigation Mode</strong> to <em>On</em>. The
          indicator turns blue.
        </li>
        <li>
          Click the link below. You should see the loading skeleton instead of
          the final page content.
        </li>
        <li>
          Click the blue <em>Instant UI only</em> indicator to unblock dynamic
          data and resume normal navigation.
        </li>
      </ol>
      <nav style={{ marginTop: '1.5rem' }}>
        <Link
          href="/target-page"
          id="link-to-target"
          style={{
            display: 'inline-block',
            padding: '0.5rem 1rem',
            background: '#0070f3',
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
          }}
        >
          Go to target page &rarr;
        </Link>
      </nav>
    </div>
  )
}

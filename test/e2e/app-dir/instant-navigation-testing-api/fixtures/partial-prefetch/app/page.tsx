import Link from 'next/link'

export default function HomePage() {
  return (
    <div>
      <h1 data-testid="home-title">Partial Prefetch Shell Test</h1>
      {/* Default (partial) prefetch — only the shell is prefetched. */}
      <Link href="/dynamic-params/hello" id="partial-link">
        Partial link
      </Link>
      {/* Full prefetch — a speculative (whole-route) prefetch that warms the
          concrete-param entry too. */}
      <Link href="/dynamic-params/hello" prefetch={true} id="full-link">
        Full prefetch link
      </Link>
    </div>
  )
}

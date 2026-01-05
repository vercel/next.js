import Link from 'next/link'

export default function Home() {
  return (
    <div id="home-content">
      <h2>Home Page</h2>
      <p>This is the home page with visible content.</p>
      <nav>
        <Link
          href="/debug"
          id="link-debug"
          style={{ fontWeight: 'bold', color: '#dc2626' }}
        >
          Debug Chunk Errors
        </Link>
        <br />
        <Link href="/dynamic" id="link-dynamic">
          Go to Dynamic Page
        </Link>
        <br />
        <Link href="/navigation-target" id="link-nav-target">
          Go to Navigation Target
        </Link>
        <br />
        <Link href="/other" id="link-other">
          Go to Other Page
        </Link>
      </nav>
    </div>
  )
}

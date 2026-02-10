import Link from 'next/link'

export default function HomePage() {
  return (
    <div>
      <h1 data-testid="home-title">Instant Navigation API Test</h1>
      <Link href="/target-page" id="link-to-target">
        Go to target page
      </Link>
      <Link
        href="/runtime-prefetch-target?myParam=testValue"
        id="link-to-runtime-prefetch"
      >
        Go to runtime prefetch target
      </Link>
      <Link
        href="/full-prefetch-target"
        prefetch={true}
        id="link-to-full-prefetch"
      >
        Go to full prefetch target
      </Link>
      {/* Plain anchor for MPA navigation testing (bypasses client-side routing) */}
      <a href="/target-page" id="plain-link-to-target">
        Go to target page (MPA)
      </a>
    </div>
  )
}

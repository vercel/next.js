import Link from 'next/link'

export default function HomePage() {
  return (
    <div>
      <h1 data-testid="home-title">Instant Navigation API Test (blocking)</h1>
      <ul>
        <li>
          <Link href="/blocking-cookies/x" id="link-to-blocking-cookies">
            Go to blocking cookies page
          </Link>
        </li>
      </ul>
    </div>
  )
}

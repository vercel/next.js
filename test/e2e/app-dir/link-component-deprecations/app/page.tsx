import Link from 'next/link'

export default function HomePage() {
  return (
    <>
      <Link legacyBehavior href="/target-page">
        <a>Target page</a>
      </Link>
      <Link legacyBehavior href="/target-page?foo=bar">
        <a>Another Target page</a>
      </Link>
    </>
  )
}

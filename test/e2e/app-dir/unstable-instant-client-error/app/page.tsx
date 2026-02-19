import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <Link id="hard-link" href="/hard">
        hard nav
      </Link>
      <Link id="soft-link" href="/soft">
        soft nav
      </Link>
    </main>
  )
}

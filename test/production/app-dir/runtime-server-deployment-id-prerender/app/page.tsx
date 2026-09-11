import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <p id="home">prerendered home</p>
      <Link id="nav-link" href="/dynamic">
        Go to dynamic page
      </Link>
    </main>
  )
}

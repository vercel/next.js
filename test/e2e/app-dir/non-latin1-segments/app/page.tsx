import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <h1 id="home">home</h1>
      <Link href="/hello" id="to-route-group">
        to route group
      </Link>
      <Link href="/docs/intro" id="to-unicode-param">
        to unicode param
      </Link>
    </main>
  )
}

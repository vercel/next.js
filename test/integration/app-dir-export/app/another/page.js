import Link from 'next/link'

export default function Another() {
  return (
    <main>
      <h1>Another</h1>
      <url>
        <li>
          <Link href="/">Visit the home page</Link>
        </li>
        <li>
          <Link href="/another">another page</Link>
        </li>
        <li>
          <Link href="/another/first">another first page</Link>
        </li>
        <li>
          <Link href="/another/second">another second page</Link>
        </li>
      </url>
    </main>
  )
}

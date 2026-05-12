import Link from 'next/link'

export default function Another() {
  return (
    <main>
      <h1>Another</h1>
      <ul>
        <li>
          <Link href="/">Visit the home page</Link>
        </li>
        <li>
          <Link href="/another">another page</Link>
        </li>
        <li>
          <Link href="/another/third">another third page</Link>
        </li>
      </ul>
    </main>
  )
}

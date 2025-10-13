import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      <ul>
        <li>
          <Link href="/another">another no trailingslash</Link>
        </li>
        <li>
          <Link href="/another/">another has trailingslash</Link>
        </li>
        <li>
          <Link href="/another/first">another first page</Link>
        </li>
        <li>
          <Link href="/another/second">another second page</Link>
        </li>
        <li>
          <Link href="/image-import">image import page</Link>
        </li>
        <li>
          <Link href="/client-dynamic/first">client dynamic first</Link>
        </li>
        <li>
          <Link href="/client-dynamic/second">client dynamic second</Link>
        </li>
      </ul>
    </main>
  )
}

import Link from 'next/link'

export default function Page() {
  return (
    <ul>
      <li>
        <Link href="/non-existent-page?id=1">/non-existent-page?id=1</Link>
      </li>
      <li>
        <Link href="/non-existent-page?id=2">/non-existent-page?id=2</Link>
      </li>
      <li>
        <Link href="/pages-dir?param=1">/pages-dir?param=1</Link>
      </li>
      <li>
        <Link href="/pages-dir?param=2">/pages-dir?param=2</Link>
      </li>
      <li>
        <Link href="/route-handler?param=1">/route-handler?param=1</Link>
      </li>
      <li>
        <Link href="/route-handler?param=2">/route-handler?param=2</Link>
      </li>
    </ul>
  )
}

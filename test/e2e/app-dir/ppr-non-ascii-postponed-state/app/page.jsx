import Link from 'next/link'

export default function Page() {
  return (
    <nav>
      <Link href="/ascii">ascii</Link>
      <Link href="/non-ascii">non-ascii</Link>
    </nav>
  )
}

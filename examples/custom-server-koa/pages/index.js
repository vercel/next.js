import Link from 'next/link'

export default function Home() {
  return (
    <ul>
      <li>
        <Link href="/a">a</Link>
      </li>
      <li>
        <Link href="/b">b</Link>
      </li>
    </ul>
  )
}

import Link from 'next/link'

export default function Home() {
  return (
    <ul>
      <li>
        <Link href="/b" as="/a">
          a
        </Link>
      </li>
      <li>
        <Link href="/a" as="/b">
          b
        </Link>
      </li>
    </ul>
  )
}

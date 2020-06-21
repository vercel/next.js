import Link from 'next/link'

export default function Home() {
  return (
    <ul>
      <li>
        <Link href="/a">
          <a>a</a>
        </Link>
      </li>
      <li>
        <Link href="/b">
          <a>b</a>
        </Link>
      </li>
    </ul>
  )
}

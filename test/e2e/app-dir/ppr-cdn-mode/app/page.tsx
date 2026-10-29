import Link from 'next/link'

export default function Page() {
  return (
    <ul>
      <li>
        <Link href="/static">/static</Link>
      </li>
      <li>
        <Link href="/partial">/partial</Link>
      </li>
      <li>
        <Link href="/partial-multi">/partial-multi</Link>
      </li>
      <li>
        <Link href="/fallback/a">/fallback/a</Link>
      </li>
      <li>
        <Link href="/fallback/b">/fallback/b</Link>
      </li>
      <li>
        <Link href="/blocking">/blocking</Link>
      </li>
    </ul>
  )
}

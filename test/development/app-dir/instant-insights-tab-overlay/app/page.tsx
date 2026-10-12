import Link from 'next/link'

export default function HomePage() {
  return (
    <ul>
      <li>
        <Link href="/issue-only">issue-only</Link>
      </li>
      <li>
        <Link href="/insight-only">insight-only</Link>
      </li>
    </ul>
  )
}

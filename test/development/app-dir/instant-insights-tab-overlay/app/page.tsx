import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <ul>
        <li>
          <Link href="/issue-only">issue-only (sync IO)</Link>
        </li>
        <li>
          <Link href="/insight-only">insight-only (in-nav fetch)</Link>
        </li>
      </ul>
    </main>
  )
}

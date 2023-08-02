import Link from 'next/link'

export default function PathWithDot() {
  return (
    <main>
      <h1>Path With Dot</h1>
      <ul>
        <li>
          <Link href="/another">visit another page</Link>
        </li>
      </ul>
    </main>
  )
}

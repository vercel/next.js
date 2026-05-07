import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      <ul>
        <li>
          <Link href="/hydrated/first">Visit hydrated thread first</Link>
        </li>
      </ul>
    </main>
  )
}

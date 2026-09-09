import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <p>Quality tools and hardware since 1987.</p>
      <p>
        <Link href="/catalog?page=1">Browse the catalog</Link>
      </p>
    </main>
  )
}

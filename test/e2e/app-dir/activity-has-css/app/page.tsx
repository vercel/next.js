import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      <nav>
        <Link href="/page-a" prefetch={false}>
          Page A
        </Link>
        <Link href="/page-b" prefetch={false}>
          Page B
        </Link>
      </nav>
    </main>
  )
}

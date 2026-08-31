import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Featured product</h1>
      <Link href="/product">View Premium Widget</Link>
    </main>
  )
}

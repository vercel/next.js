import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <h1 id="home">Home</h1>
      <Link href="/about">Go to about</Link>
    </main>
  )
}

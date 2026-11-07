import Link from 'next/link'

export default function PageB() {
  return (
    <main>
      <h1>Route B</h1>
      <p>
        <Link href="/a">Go to A (gated)</Link>
      </p>
      <p>
        <Link href="/c">Go to C</Link>
      </p>
    </main>
  )
}

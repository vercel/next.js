import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Bundle Analyzer Evaluation</h1>
      <p>This route is intentionally small.</p>
      <Link href="/dashboard">Open the inefficient dashboard</Link>
    </main>
  )
}

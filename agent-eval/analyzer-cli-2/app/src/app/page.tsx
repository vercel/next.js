import Link from 'next/link'

export default function Home() {
  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif' }}>
      <h1>Analytics workspace</h1>
      <p>Review the latest generated business report.</p>
      <Link href="/reports">Open reports</Link>
    </main>
  )
}

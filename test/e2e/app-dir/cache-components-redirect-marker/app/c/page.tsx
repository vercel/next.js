import Link from 'next/link'

export default function PageC() {
  return (
    <main>
      <h1>Route C</h1>
      <p data-testid="route-c">Welcome to Route C</p>
      <p>
        <Link href="/a">Go to A (gated)</Link>
      </p>
      <p>
        <Link href="/b">Go to B</Link>
      </p>
    </main>
  )
}

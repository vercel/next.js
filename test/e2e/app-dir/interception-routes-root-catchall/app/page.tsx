import Link from 'next/link'

export default async function Home() {
  return (
    <div>
      <Link href="/items/1">Open Items #1 (Intercepted)</Link>
      <Link href="/foobar">Go to Catch-All Page</Link>
    </div>
  )
}

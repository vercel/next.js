import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <h1>User promise demo</h1>
      <Link href="/learn" id="learn-link">
        Go to learn
      </Link>
    </main>
  )
}

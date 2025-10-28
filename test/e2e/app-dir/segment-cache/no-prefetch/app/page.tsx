import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <h1>Home</h1>
      <Link href="/with-loading" prefetch={false}>
        Go to /with-loading (no prefetch)
      </Link>
    </main>
  )
}

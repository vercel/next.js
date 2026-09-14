import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <h1>Home page</h1>
      <Link id="target-link" href="/target/" prefetch={false}>
        Target page
      </Link>
    </main>
  )
}

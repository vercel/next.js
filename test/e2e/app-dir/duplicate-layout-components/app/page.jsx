import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <h1>Home Page</h1>
      <Link href="/solutions/404" id="to-404">
        Go to 404
      </Link>
    </main>
  )
}

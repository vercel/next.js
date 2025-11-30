import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1>Home Page</h1>
      <nav>
        <Link href="/runtime-error">Go to Runtime Error</Link>
        <br />
        <Link href="/build-error">Go to Build Error</Link>
      </nav>
    </div>
  )
}

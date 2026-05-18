import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h2 id="test-root-page">Test Page</h2>
      <Link id="go-test-new" href="/test/new">
        Go to /test/new
      </Link>
    </div>
  )
}

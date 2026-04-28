import Link from 'next/link'

export default function Page() {
  return (
    <div id="test-new-modal">
      <h3>Test New Modal</h3>
      <Link id="go-test-id" href="/test/42">
        Go to /test/42
      </Link>
    </div>
  )
}

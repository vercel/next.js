import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h2>Page intercepted from root</h2>
      <Link href="/en/example">Back to /en/example</Link>
    </div>
  )
}

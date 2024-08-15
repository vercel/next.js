import Link from 'next/link'

export default function Page() {
  return (
    <div id="sub-page">
      Hello from /revalidate-0/test-page/sub-page{' '}
      <Link href="/revalidate-0/test-page">Back to Test Page</Link>
    </div>
  )
}

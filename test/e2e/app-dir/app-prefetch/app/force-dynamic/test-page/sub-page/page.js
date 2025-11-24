import Link from 'next/link'

export default function Page() {
  return (
    <div id="sub-page">
      Hello from /force-dynamic/test-page/sub-page{' '}
      <Link href="/force-dynamic/test-page">Back to Test Page</Link>
    </div>
  )
}

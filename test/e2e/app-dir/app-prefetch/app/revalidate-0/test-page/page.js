import Link from 'next/link'

export default function Page() {
  return (
    <div id="test-page">
      Hello from /revalidate-0/test-page{' '}
      <Link href="/revalidate-0/test-page/sub-page">To Sub Page</Link>
    </div>
  )
}

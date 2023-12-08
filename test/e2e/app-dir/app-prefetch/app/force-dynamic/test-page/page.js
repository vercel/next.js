import Link from 'next/link'

export default function Page() {
  return (
    <div id="test-page">
      Hello from /force-dynamic/test-page{' '}
      <Link href="/force-dynamic/test-page/sub-page">To Sub Page</Link>
    </div>
  )
}

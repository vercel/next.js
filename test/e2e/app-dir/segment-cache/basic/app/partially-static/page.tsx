import Link from 'next/link'

export default function FullyStaticStart() {
  return (
    <>
      <p>
        Demonstrates that when navigating to a partially static route, the
        server does not render static layouts that were already prefetched.
      </p>
      <ul>
        <li>
          <Link href="/partially-static/target-page">Target</Link>
        </li>
      </ul>
    </>
  )
}

import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      <h2>
        Links with <code>prefetch=false</code>
      </h2>
      <ul>
        <li>
          <Link href="/partially-static" prefetch={false}>
            Go to partially static page
          </Link>
        </li>
        <li>
          <Link href="/fully-static" prefetch={false}>
            Go to fully static page
          </Link>
        </li>
        <li>
          <Link href="/with-static-params/foo" prefetch={false}>
            Go to page with static params
          </Link>
        </li>
        <li>
          <Link href="/with-fallback-params/foo" prefetch={false}>
            Go to page with fallback params
          </Link>
        </li>
        <li>
          <Link href="/runtime-prefetchable" prefetch={false}>
            Go to runtime-prefetchable page
          </Link>
        </li>
      </ul>
    </main>
  )
}

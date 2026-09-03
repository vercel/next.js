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
          <Link href="/runtime-prefetchable" prefetch={false}>
            Go to runtime-prefetchable page
          </Link>
        </li>
        <li>
          <Link href="/runtime-prefetch-disabled" prefetch={false}>
            Go to prefetch-disabled page
          </Link>
        </li>
      </ul>
    </main>
  )
}

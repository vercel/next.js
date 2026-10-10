import Link from 'next/link'
import { LinkAccordion } from '../components/link-accordion'

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
        <li>
          <Link href="/prefetch-partial" prefetch={false}>
            Go to prefetch=partial page
          </Link>
        </li>
      </ul>

      <h2>Cache value consistency</h2>
      <ul>
        <li data-prefetch="auto">
          <LinkAccordion href="/cache-from-rdc">
            /cache-from-rdc (prefetch="auto")
          </LinkAccordion>
        </li>
        <li data-prefetch="false">
          <Link href="/cache-from-rdc" prefetch={false}>
            /cache-from-rdc (prefetch="false")
          </Link>
        </li>
      </ul>
    </main>
  )
}

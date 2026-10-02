import Link from 'next/link'
import { LinkAccordion } from '../components/link-accordion'

export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      <h2>Runtime prefetchable</h2>
      <ul>
        <li>
          <Link href="/runtime-prefetchable" prefetch={false}>
            Go to runtime-prefetchable page
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

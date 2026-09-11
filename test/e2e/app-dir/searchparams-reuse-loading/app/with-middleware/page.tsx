import Link from 'next/link'
import { LinkAccordion } from '../link-accordion'

export default function Page() {
  // Link order is significant: viewport prefetches are prioritized by document
  // order. The parameter-less full-prefetch link stays first, while the id=3
  // link is hidden behind an accordion so its prefetch can be controlled by the
  // test instead of racing the initial automatic burst.
  return (
    <ul>
      <li>
        <Link href="/with-middleware/search-params" prefetch={true}>
          /search-params (prefetch: true)
        </Link>
      </li>
      <li>
        <LinkAccordion href="/with-middleware/search-params?id=3" />
      </li>
      <li>
        <Link href="/with-middleware/search-params?id=2">
          /search-params?id=2
        </Link>
      </li>
      <li>
        <Link href="/with-middleware/search-params?id=1">
          /search-params?id=1
        </Link>
      </li>
    </ul>
  )
}

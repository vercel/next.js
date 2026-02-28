import Link from 'next/link'
import { LinkAccordion } from '../../components/link-accordion'

export default function FeedPage() {
  return (
    <div>
      <div id="feed-page">Feed page</div>

      <h2>Step 1: Navigate without prefetch</h2>
      <p style={{ color: '#666', fontSize: 14 }}>
        Click this link to navigate to the photo page. Since prefetching is
        disabled, the client has no cached data for this route and will fetch
        everything from the server. The response is then stored in the route
        cache for future use.
      </p>
      <p>
        <Link href="/photo/1" prefetch={false} id="link-no-prefetch">
          Go to photo 1 (no prefetch)
        </Link>
      </p>

      <h2>Step 3: Reveal a prefetched link</h2>
      <p style={{ color: '#666', fontSize: 14 }}>
        After navigating to the photo page and back, toggle this checkbox to
        reveal a prefetched link to the same URL. The prefetch system should
        find the route data already in the cache from step 1 — no new network
        requests should be needed. If the cache key was stored incorrectly, this
        will trigger a redundant prefetch request.
      </p>
      <p>
        <LinkAccordion href="/photo/1">
          Go to photo 1 (prefetched)
        </LinkAccordion>
      </p>
    </div>
  )
}

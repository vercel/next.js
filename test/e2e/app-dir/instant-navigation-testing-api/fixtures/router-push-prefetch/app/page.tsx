import Link from 'next/link'
import PushLink from './push-link'

export default function HomePage() {
  return (
    <div>
      <h1 data-testid="home-title">Router Push After Full Prefetch</h1>
      {/* A plain `prefetch={true}` link: clicking it commits the fully
          prefetched destination instantly under the lock. */}
      <Link href="/dynamic-params/hello" prefetch={true} id="click-link">
        Click link
      </Link>
      {/* The same `prefetch={true}` link, but its click is intercepted by a
          client component (as a page-transition wrapper does) and replayed as
          a `router.push()` to the very same href. */}
      <PushLink href="/dynamic-params/hello" id="push-link">
        Push link
      </PushLink>
    </div>
  )
}

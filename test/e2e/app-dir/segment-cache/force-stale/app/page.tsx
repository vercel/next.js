import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { LinkAccordion } from '../components/link-accordion'

// Not an essential detail of the fixture — just opts this route into a PPR
// render. Without a dynamic hole, a fully static page's initial inline
// flight data carries the "inlining hints stale" bit (because build-time
// prerender runs before prefetch hints are computed), which would then be
// inherited by any cache entry synthesized from this page's tree. That's
// a correct, deliberate behavior of the inlining system, but it's
// orthogonal to what these tests are checking.
async function Dynamic() {
  await connection()
  return null
}

export default function Page() {
  return (
    <>
      <Suspense>
        <Dynamic />
      </Suspense>
      <ul>
        <li>
          <LinkAccordion href="/dynamic" prefetch={true}>
            Dynamic page
          </LinkAccordion>
        </li>
        <li>
          <Link href="/dynamic" prefetch={false} id="link-without-prefetch">
            Dynamic page (no prefetch)
          </Link>
        </li>
      </ul>
    </>
  )
}

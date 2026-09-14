import { Suspense } from 'react'
import { connection } from 'next/server'
import { LinkAccordion } from '../../components/link-accordion'

async function HubContent() {
  await connection()
  return <div id="hub-content">Hub</div>
}

// Hub page used by rewrite-detection tests as a navigation target instead of
// `browser.back()`. Each visit lands on a fresh page where all accordions
// start closed, so previously-revealed Links can't be re-mounted by BFCache
// and trigger uncontrolled prefetches outside any `act` scope.
export default function HubPage() {
  return (
    <div>
      <Suspense fallback="Loading hub...">
        <HubContent />
      </Suspense>
      <ul>
        <li>
          <LinkAccordion href="/rewritten/second" prefetch={false}>
            Rewritten Second
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/search-rewrite?v=beta" prefetch={false}>
            Search Rewrite Beta (v=beta → content=beta)
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}

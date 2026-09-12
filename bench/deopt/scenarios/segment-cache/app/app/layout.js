import Link from 'next/link'
import { LinkBatches } from './link-batches'

// How many link batches the nav can reveal, and how many links each contains.
// The driver reveals them one batch at a time so each wave of prefetch tasks
// is observable. Lives in the root layout so the revealed state survives
// client-side navigations (layouts persist; pages unmount).
const BATCH_COUNT = 4
const LINKS_PER_KIND = 12

function batchLinks(batch) {
  const links = []
  for (let i = 0; i < LINKS_PER_KIND; i++) {
    const n = batch * LINKS_PER_KIND + i
    links.push({ href: `/static/${n % 20}`, kind: 'static' })
    links.push({ href: `/products/${n}`, kind: 'dynamic' })
    links.push({ href: `/docs/section-${batch}/topic/${n}`, kind: 'catch-all' })
    // Full prefetch (static + dynamic data) for a subset.
    if (i % 4 === 0) {
      links.push({ href: `/products/full-${n}`, kind: 'full', prefetch: true })
    }
  }
  return links
}

export default function RootLayout({ children }) {
  const batches = []
  for (let b = 0; b < BATCH_COUNT; b++) {
    batches.push(batchLinks(b))
  }
  return (
    <html lang="en">
      <body>
        <header>
          <Link href="/" id="link-home">
            home
          </Link>{' '}
          <Link href="/dash" id="link-dash">
            dash
          </Link>
        </header>
        <LinkBatches batches={batches} />
        {children}
      </body>
    </html>
  )
}

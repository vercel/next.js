import { LinkAccordion } from '../../../components/link-accordion'

/**
 * Index page for the instant loading state test. This is the canonical test
 * for the vary params feature — it demonstrates the core user-facing benefit:
 * instant loading feedback when navigating to routes that share cached segments.
 *
 * All links share category='electronics' but have different itemId values.
 * Since the layout only accesses 'category', the layout segment is cached after
 * the first prefetch and reused for all subsequent links.
 *
 * The page component renders itemId dynamically (not in generateStaticParams),
 * so when navigating, the cached layout/loading shell renders instantly while
 * the dynamic page content loads in the background.
 *
 * Manual testing:
 * 1. Click the checkbox for "phone" — triggers prefetch, layout is fetched
 * 2. Click the checkbox for "tablet" — cache hit, no request
 * 3. Click the checkbox for "laptop" — cache hit, no request
 * 4. Click the "headphones" link to navigate — loading state appears instantly
 */
export default function InstantLoadingIndexPage() {
  return (
    <div id="instant-loading-index">
      <h1>Instant Loading State Test</h1>
      <p>
        Verifies that cached segments render instantly during navigation, even
        when dynamic content hasn&apos;t loaded yet.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/instant-loading/electronics/phone">
            Electronics: Phone
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/instant-loading/electronics/tablet">
            Electronics: Tablet
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/instant-loading/electronics/laptop">
            Electronics: Laptop
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/instant-loading/electronics/headphones">
            Electronics: Headphones
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}

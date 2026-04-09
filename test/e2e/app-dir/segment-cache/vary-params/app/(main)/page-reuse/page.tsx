import { LinkAccordion } from '../../../components/link-accordion'

/**
 * Index page for the page segment reuse test.
 *
 * This test demonstrates a non-obvious case: a page segment can be reused when
 * it doesn't access a param that the layout DOES access. This is the inverse
 * of the typical pattern where layouts are reused while pages vary.
 *
 * Setup:
 * - Layout accesses BOTH `category` AND `item` → varies on both
 * - Page accesses ONLY `category` → varies only on category
 *
 * When navigating between routes that share the same category but different
 * items (e.g., /electronics/phone → /electronics/tablet), the layout must be
 * re-fetched (it accesses `item`), but the page is a cache hit (it only
 * accesses `category`, which hasn't changed).
 *
 * Manual testing:
 * 1. Click checkbox for "phone" — layout and page both fetched
 * 2. Click checkbox for "tablet" — layout re-fetched, page is cache hit
 */
export default function PageReuseIndexPage() {
  return (
    <div id="page-reuse-index">
      <h1>Page Segment Reuse Test</h1>
      <p>
        Tests the inverse of typical layout reuse: the page segment can be
        reused when it doesn&apos;t access a param that the layout does access.
      </p>
      <p>
        <strong>Layout:</strong> accesses both category and item
        <br />
        <strong>Page:</strong> accesses only category
      </p>
      <ul>
        <li>
          <LinkAccordion href="/page-reuse/electronics/phone">
            Electronics: Phone
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/page-reuse/electronics/tablet">
            Electronics: Tablet
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}

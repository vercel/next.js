import { LinkAccordion } from '../../../components/link-accordion'

/**
 * Index page for the runtime prefetch vary params test.
 *
 * This tests vary params tracking with runtime prefetching enabled. Unlike
 * static prefetching, runtime prefetching allows dynamic params to be rendered
 * as part of the prefetch (rather than being omitted). This enables testing
 * more specific combinations:
 *
 * - The page renders `category` in the static portion → tracked in varyParams
 * - The page renders `itemId` in the dynamic portion → NOT tracked in varyParams
 *
 * Since `itemId` is only accessed in the dynamic section (inside Suspense after
 * connection()), the page should only vary on `category`, allowing cache reuse
 * across different itemId values.
 *
 * Manual testing:
 * 1. Click checkbox for "phone" — triggers prefetch, page content fetched
 * 2. Click checkbox for "tablet" and "laptop" — cache hits (same category)
 * 3. Navigate to "headphones" — loading state instant, then dynamic content loads
 */
export default function RuntimePrefetchIndexPage() {
  return (
    <div id="runtime-prefetch-index">
      <h1>Runtime Prefetch Vary Params Test</h1>
      <p>
        Tests vary params tracking with runtime prefetching. The page renders
        category in the static portion and itemId in the dynamic portion.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/runtime-prefetch/electronics/phone">
            Electronics: Phone
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-prefetch/electronics/tablet">
            Electronics: Tablet
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-prefetch/electronics/laptop">
            Electronics: Laptop
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-prefetch/electronics/headphones">
            Electronics: Headphones
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-prefetch/clothing/shirt">
            Clothing: Shirt
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}

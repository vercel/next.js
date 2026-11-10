import { LinkAccordion } from '../../../components/link-accordion'

/**
 * Index page for the metadata vary params test.
 *
 * This tests that param access in generateMetadata is tracked in the head
 * segment's varyParams, separate from body segment tracking.
 *
 * Setup:
 * - [slug]/page.tsx has generateMetadata that accesses params
 * - The page body does NOT access params
 * - Links go to /metadata/aaa, /metadata/bbb, /metadata/ccc
 *
 * Expected behavior:
 * - First prefetch fetches the head segment (varies on slug)
 * - Subsequent prefetches with different slugs require new fetches
 *   because metadata accesses the slug param
 *
 * Manual testing:
 * 1. Click checkbox for "aaa" - triggers prefetch, content fetched
 * 2. Click checkbox for "bbb" - cache miss, new prefetch (slug changed)
 * 3. Click checkbox for "ccc" - cache miss, new prefetch (slug changed)
 */
export default function MetadataIndexPage() {
  return (
    <div id="metadata-index">
      <h1>Metadata Vary Params Test</h1>
      <p>
        Tests that param access in generateMetadata is tracked in the head
        segment&apos;s varyParams.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/metadata/aaa">Slug: aaa</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/metadata/bbb">Slug: bbb</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/metadata/ccc">Slug: ccc</LinkAccordion>
        </li>
      </ul>
    </div>
  )
}

import { LinkAccordion } from '../../../components/link-accordion'

/**
 * Index page for the metadata-no-params vary params test.
 *
 * This is the inverse of the metadata test: generateMetadata does NOT access
 * params, so the head segment should be cacheable across different param values.
 *
 * Setup:
 * - [slug]/page.tsx has generateMetadata that does NOT access params
 * - The page body does NOT access params either
 * - Links go to /metadata-no-params/aaa, /metadata-no-params/bbb
 *
 * Expected behavior:
 * - First prefetch fetches head and body segments
 * - Subsequent prefetches with different slugs are cache hits
 *   (neither metadata nor body access params)
 *
 * Manual testing:
 * 1. Click checkbox for "aaa" - triggers prefetch, content fetched
 * 2. Click checkbox for "bbb" - cache hit, no new request
 */
export default function MetadataNoParamsIndexPage() {
  return (
    <div id="metadata-no-params-index">
      <h1>Metadata No Params Test</h1>
      <p>
        Tests that when generateMetadata does NOT access params, the head
        segment can be cached across different param values.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/metadata-no-params/aaa">
            Slug: aaa
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/metadata-no-params/bbb">
            Slug: bbb
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}

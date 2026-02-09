import { LinkAccordion } from '../../../components/link-accordion'

/**
 * Index page for the search params access tracking test.
 *
 * This tests that when a page accesses searchParams, separate cache entries
 * are created for each unique search param value.
 *
 * Two sub-routes:
 * - /search-params/target-page?foo=X - Page accesses searchParams, NO cache reuse
 * - /search-params/static-target?foo=X - Page does NOT access searchParams, cache reuse
 *
 * Manual testing:
 * 1. Click checkbox for "?foo=1" target link - triggers prefetch
 * 2. Click checkbox for "?foo=2" target link - should trigger NEW prefetch (no cache)
 * 3. Click checkbox for "?foo=1" static-target link - triggers prefetch
 * 4. Click checkbox for "?foo=2" static-target link - should be cache hit
 */
export default function SearchParamsIndexPage() {
  return (
    <div id="search-params-index">
      <h1>Search Params Access Tracking Test</h1>
      <p>
        Tests that accessing searchParams creates separate cache entries for
        each unique search param value.
      </p>

      <h2>Target (accesses searchParams)</h2>
      <ul>
        <li>
          <LinkAccordion href="/search-params/target-page?foo=1">
            Target with foo=1
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/search-params/target-page?foo=2">
            Target with foo=2
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/search-params/target-page?foo=3">
            Target with foo=3
          </LinkAccordion>
        </li>
      </ul>

      <h2>Static Target (does not access searchParams)</h2>
      <ul>
        <li>
          <LinkAccordion href="/search-params/static-target?foo=1">
            Static target with foo=1
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/search-params/static-target?foo=2">
            Static target with foo=2
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/search-params/static-target?foo=3">
            Static target with foo=3
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}

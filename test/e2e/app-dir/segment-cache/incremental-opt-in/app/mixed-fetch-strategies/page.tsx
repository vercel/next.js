import { LinkAccordion } from '../link-accordion'

export default function MixedFetchStrategies() {
  return (
    <>
      <p>
        This page tests what happens when a shared layout belongs to both a
        PPR-enabled route and a non-PPR enabled route. The layout data should be
        omitted when prefetching the non-PPR enabled route, because it's inside
        another layout that has a loading boundary. But it should be included
        when prefetching the route that has PPR enabled.
      </p>
      <ul>
        <li>
          <LinkAccordion
            id="ppr-enabled"
            href="/mixed-fetch-strategies/has-loading-boundary/a/b/shared-layout/ppr-enabled"
          >
            Link to PPR enabled page
          </LinkAccordion>
          <ul>
            <li>
              <LinkAccordion
                id="ppr-enabled-prefetch-true"
                prefetch={true}
                href="/mixed-fetch-strategies/has-loading-boundary/a/b/shared-layout/ppr-enabled"
              >
                Same link, but with prefetch=true
              </LinkAccordion>
            </li>
          </ul>
        </li>
        <li>
          <LinkAccordion
            id="ppr-disabled"
            href="/mixed-fetch-strategies/has-loading-boundary/a/b/shared-layout/ppr-disabled"
          >
            Link to PPR disabled page
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}

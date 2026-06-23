import { LinkAccordion } from '../../../components/link-accordion'

export default function InPageLoadingBoundaryIndexPage() {
  return (
    <div id="in-page-loading-boundary-index">
      <h1>In-Page Loading Boundary Test</h1>
      <p>
        Verifies that a page with an in-page Suspense boundary (instead of a
        separate loading.tsx) produces a shareable prefetch. Since there is no
        generateStaticParams, the segment prefetch is generated from a prerender
        where params are unresolved (hanging). The child component that awaits
        params suspends, so the prefetch contains only the Suspense fallback
        with empty varyParams — making it reusable across all slug values.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/in-page-loading-boundary/phone">
            Phone
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/in-page-loading-boundary/tablet">
            Tablet
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/in-page-loading-boundary/laptop">
            Laptop
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/in-page-loading-boundary/headphones">
            Headphones
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}

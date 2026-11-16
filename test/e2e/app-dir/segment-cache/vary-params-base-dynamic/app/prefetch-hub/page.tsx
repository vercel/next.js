import { LinkAccordion } from '../../components/link-accordion'

// Starting point for the tests that collect segment prefetch responses inside
// an `act` scope. Unlike the home page, this page must not render any visible
// <Link>: those prefetch on page load, outside of `act`, which races with the
// accordion-triggered prefetches the tests want to observe.
export default function PrefetchHubPage() {
  return (
    <div id="prefetch-hub-page">
      <ul>
        <li>
          <LinkAccordion href="/acme/dashboard">
            Team project: acme/dashboard
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/globex/portal">
            Team project: globex/portal
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}

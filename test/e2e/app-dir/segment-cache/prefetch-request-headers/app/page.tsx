import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <ul>
      <li>
        <LinkAccordion href="/default">
          Default prefetch to a route without Partial Prefetching
        </LinkAccordion>
      </li>
      <li>
        <LinkAccordion href="/pp">
          Default prefetch to a Partial Prefetching route (instant + eager)
        </LinkAccordion>
      </li>
      <li>
        <LinkAccordion href="/runtime" prefetch={true}>
          Full prefetch to a runtime-prefetchable route (allow-runtime)
        </LinkAccordion>
      </li>
      <li>
        <LinkAccordion href="/legacy" prefetch={true}>
          Full prefetch to a route without Partial Prefetching
        </LinkAccordion>
      </li>
      <li>
        <LinkAccordion href="/nav-target" prefetch={false}>
          Unprefetched link, for testing navigation requests
        </LinkAccordion>
      </li>
    </ul>
  )
}

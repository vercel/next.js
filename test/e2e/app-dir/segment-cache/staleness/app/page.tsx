import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <>
      <p>
        This page is used to test various scenarios related to prefetch cache
        staleness. In the corresponding e2e test, the links below are prefetched
        (by toggling their visibility), time is elapsed, and then prefetched
        again to check whether a new network request is made.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/stale-2-minutes">
            Page with stale time of 2 minutes
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/stale-4-minutes">
            Page with stale time of 4 minutes
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-stale-2-minutes">
            Page whose runtime prefetch has a stale time of 2 minutes
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-stale-4-minutes">
            Page whose runtime prefetch has a stale time of 4 minutes
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/dynamic">Page with dynamic data</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/seconds">
            Page with cached data with <code>cacheLife("seconds")</code>
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}

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
          <LinkAccordion href="/stale-5-minutes">
            Page with stale time of 5 minutes
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/stale-10-minutes">
            Page with stale time of 10 minutes
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-stale-5-minutes" prefetch={true}>
            Page whose runtime prefetch has a stale time of 5 minutes
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-stale-10-minutes" prefetch={true}>
            Page whose runtime prefetch has a stale time of 10 minutes
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

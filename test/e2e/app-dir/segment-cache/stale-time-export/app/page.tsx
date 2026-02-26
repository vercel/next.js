import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <>
      <p>
        Tests for export const unstable_staleTime segment config. This test
        suite does NOT use cacheComponents, as unstable_staleTime segment config
        is not supported with cacheComponents.
      </p>
      <p>
        No global staleTimes config is provided in next.config.js. Defaults are
        static=300s (5 minutes) and dynamic=0s.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/static-stale-6-minutes">
            Static link
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/dynamic-stale-5-minutes">
            Dynamic link
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}

import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <>
      <p>
        Tests for export const unstable_staleTime segment config. This test
        suite does NOT use cacheComponents, as unstable_staleTime segment config
        is not supported with cacheComponents.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/static-stale-5-minutes">
            Static page with unstable_staleTime = 300
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/dynamic-stale-5-minutes" prefetch={false}>
            Dynamic page with unstable_staleTime = 300
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}

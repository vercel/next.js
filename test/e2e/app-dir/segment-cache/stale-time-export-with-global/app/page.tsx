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

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
          <LinkAccordion href="/stale-5-minutes">
            Page with unstable_staleTime = 300 (5 minutes)
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}

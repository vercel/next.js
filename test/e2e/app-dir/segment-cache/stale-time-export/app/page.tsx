import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <>
      <p>
        Tests for export const staleTime segment config. This test suite does
        NOT use cacheComponents, as staleTime segment config is not supported
        with cacheComponents.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/stale-5-minutes">
            Page with staleTime = 300 (5 minutes)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/nested/inner">
            Page with nested layouts (outer=100, inner=200)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/inherit">
            Page inheriting staleTime from layout (120)
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}

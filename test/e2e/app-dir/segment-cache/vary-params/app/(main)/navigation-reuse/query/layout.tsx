import { LinkAccordion } from '../../../../components/link-accordion'
import { RefreshButton } from './refresh-button'

/**
 * Navigation reuse: query-only navigations. The page under this layout is
 * dynamic and does not read searchParams, so a navigation that changes only
 * the query can keep its data. The links live here, in a static layout that
 * every navigation shares.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ul>
        <li>
          <LinkAccordion href="/navigation-reuse/query?x=2">x=2</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/navigation-reuse/query?x=3">x=3</LinkAccordion>
        </li>
      </ul>
      <RefreshButton />
      {children}
    </>
  )
}

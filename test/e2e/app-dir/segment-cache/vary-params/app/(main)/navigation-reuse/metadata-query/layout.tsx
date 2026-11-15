import { LinkAccordion } from '../../../../components/link-accordion'

/**
 * Navigation reuse: the page does not read searchParams but its metadata
 * does. A query-only navigation must still fetch the head, because it depends
 * on the query.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ul>
        <li>
          <LinkAccordion href="/navigation-reuse/metadata-query?x=2">
            x=2
          </LinkAccordion>
        </li>
      </ul>
      {children}
    </>
  )
}

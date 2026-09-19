import { LinkAccordion } from '../../../../components/link-accordion'

/**
 * Navigation reuse: a path param change. The [id] layout below is dynamic but
 * ignores the param; its page reads it. Navigating between ids should keep
 * the layout's data and fetch only the page.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ul>
        <li>
          <LinkAccordion href="/navigation-reuse/layout-param/a">
            a
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/navigation-reuse/layout-param/b">
            b
          </LinkAccordion>
        </li>
      </ul>
      {children}
    </>
  )
}

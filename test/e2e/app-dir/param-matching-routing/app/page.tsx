import Link from 'next/link'
import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main>
      <h1>Closed prefixes with open suffixes</h1>
      <LinkAccordion href="/en/catalog/nav-top/items/nav-bottom">
        Allowed catalog
      </LinkAccordion>
      <LinkAccordion href="/fr/catalog/nav-top/items/nav-bottom">
        Rejected catalog
      </LinkAccordion>
      <LinkAccordion href="/es/on-demand/nav-top/items/nav-bottom">
        Unseeded catalog
      </LinkAccordion>
      <Link
        href="/fr/catalog/nav-top/items/nav-bottom"
        prefetch={false}
        id="navigate-rejected"
      >
        Rejected without prefetch
      </Link>
    </main>
  )
}

import Link from 'next/link'
import { LinkAccordion } from '../components/link-accordion'
import { RevalidateControls } from '../components/revalidate-controls'

export default function HomePage() {
  return (
    <div id="home-page">
      <h1>Root Dynamic Route Vary Params</h1>
      <p>
        Prefetch dynamic team/project routes and validate segment payload
        params.
      </p>
      <ul data-nav-link-list="true">
        <li>
          <Link href="/acme/dashboard" data-nav-link="/acme/dashboard">
            Navigate: acme/dashboard
          </Link>
        </li>
        <li>
          <Link href="/globex/portal" data-nav-link="/globex/portal">
            Navigate: globex/portal
          </Link>
        </li>
        <li>
          <Link
            href="/acme/dashboard/settings/domains"
            data-nav-link="/acme/dashboard/settings/domains"
          >
            Navigate: acme/dashboard/settings/domains
          </Link>
        </li>
        <li>
          <Link
            href="/globex/portal/settings/domains"
            data-nav-link="/globex/portal/settings/domains"
          >
            Navigate: globex/portal/settings/domains
          </Link>
        </li>
      </ul>
      <ul>
        <li>
          <LinkAccordion href="/acme/dashboard">
            Team project: acme/dashboard
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/globex/portal">
            Team project: globex/portal
          </LinkAccordion>
        </li>
      </ul>
      <RevalidateControls />
    </div>
  )
}

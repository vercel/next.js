import { cacheLife } from 'next/cache'
import Link from 'next/link'
import { Suspense } from 'react'
import { LinkAccordion } from '../../../../../../components/link-accordion'

type Params = { teamSlug: string; project: string }

export default function ProjectDomainsSettingsPage({
  params,
}: {
  params: Promise<Params>
}) {
  return (
    <div id="team-project-settings-domains-page">
      <Suspense
        fallback={
          <div data-loading="true">
            Loading project settings domains page...
          </div>
        }
      >
        <ProjectDomainsSettingsContent params={params} />
      </Suspense>
      <nav data-nav-link-list="true">
        <ul>
          <li>
            <Link
              href="/acme/dashboard/settings"
              data-nav-link="/acme/dashboard/settings"
            >
              Navigate: acme/dashboard/settings
            </Link>
          </li>
          <li>
            <Link
              href="/globex/portal/settings"
              data-nav-link="/globex/portal/settings"
            >
              Navigate: globex/portal/settings
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
      </nav>
      <div data-related-link-list="true">
        <LinkAccordion href="/acme/dashboard/settings/domains">
          Related route: acme/dashboard/settings/domains
        </LinkAccordion>
        <LinkAccordion href="/globex/portal/settings/domains">
          Related route: globex/portal/settings/domains
        </LinkAccordion>
      </div>
    </div>
  )
}

async function ProjectDomainsSettingsContent({
  params,
}: {
  params: Promise<Params>
}) {
  'use cache'
  cacheLife({ stale: 0, revalidate: 1, expire: 60 })

  const { teamSlug, project } = await params
  const marker = Date.now()

  return (
    <div data-team-project-settings-domains-content="true">
      {`Project domains settings content - team: ${teamSlug}, project: ${project}, marker: ${marker}`}
    </div>
  )
}

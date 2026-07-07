import { cacheLife } from 'next/cache'
import Link from 'next/link'
import { Suspense } from 'react'
import { LinkAccordion } from '../../../components/link-accordion'

type Params = { teamSlug: string; project: string }

export default function TeamProjectPage({
  params,
}: {
  params: Promise<Params>
}) {
  return (
    <div id="team-project-page">
      <Suspense
        fallback={<div data-loading="true">Loading team/project route...</div>}
      >
        <TeamProjectContent params={params} />
      </Suspense>
      <nav data-nav-link-list="true">
        <ul>
          <li>
            <Link href="/" data-nav-link="/">
              Navigate: home
            </Link>
          </li>
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
        <LinkAccordion href="/acme/dashboard">
          Related route: acme/dashboard
        </LinkAccordion>
        <LinkAccordion href="/globex/portal">
          Related route: globex/portal
        </LinkAccordion>
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

async function TeamProjectContent({ params }: { params: Promise<Params> }) {
  'use cache'
  cacheLife({ stale: 0, revalidate: 1, expire: 60 })

  const { teamSlug, project } = await params
  const marker = Date.now()

  return (
    <div data-team-project-content="true">
      {`Team project content - team: ${teamSlug}, project: ${project}, marker: ${marker}`}
    </div>
  )
}

import { cacheLife } from 'next/cache'
import { Suspense } from 'react'

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

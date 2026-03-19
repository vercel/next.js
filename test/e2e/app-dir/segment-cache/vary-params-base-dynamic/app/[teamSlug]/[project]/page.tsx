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
  const { teamSlug, project } = await params

  return (
    <div data-team-project-content="true">
      {`Team project content - team: ${teamSlug}, project: ${project}`}
    </div>
  )
}

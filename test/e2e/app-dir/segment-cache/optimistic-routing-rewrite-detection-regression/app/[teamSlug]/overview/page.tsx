import { Suspense } from 'react'
import { connection } from 'next/server'

async function DynamicOverview({
  params,
}: {
  params: Promise<{ teamSlug: string }>
}) {
  await connection()
  const { teamSlug } = await params
  return (
    <h1 id="overview-page" data-slug={teamSlug}>
      Overview: {teamSlug}
    </h1>
  )
}

// Static visible deeper segment. Used by the static-visible-null test:
// the rewrite /team-shorter → /team-shorter/overview produces a response
// that walks through this segment with no URL part to feed it.
export default function OverviewPage({
  params,
}: {
  params: Promise<{ teamSlug: string }>
}) {
  return (
    <main>
      <Suspense fallback={<div id="team-loading">Loading team...</div>}>
        <DynamicOverview params={params} />
      </Suspense>
    </main>
  )
}

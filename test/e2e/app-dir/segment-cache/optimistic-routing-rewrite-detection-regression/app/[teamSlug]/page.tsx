import { Suspense } from 'react'
import { connection } from 'next/server'

async function DynamicTeam({
  params,
}: {
  params: Promise<{ teamSlug: string }>
}) {
  await connection()
  const { teamSlug } = await params
  return (
    <h1 id="team-page" data-slug={teamSlug}>
      Team: {teamSlug}
    </h1>
  )
}

export default function TeamPage({
  params,
}: {
  params: Promise<{ teamSlug: string }>
}) {
  return (
    <main>
      <Suspense fallback={<div id="team-loading">Loading team...</div>}>
        <DynamicTeam params={params} />
      </Suspense>
    </main>
  )
}

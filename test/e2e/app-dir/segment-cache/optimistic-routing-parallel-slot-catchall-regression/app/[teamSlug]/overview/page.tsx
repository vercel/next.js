import { Suspense } from 'react'
import { connection } from 'next/server'
import { LinkAccordion } from '../../../components/link-accordion'

async function DynamicOverview({
  params,
}: {
  params: Promise<{ teamSlug: string }>
}) {
  await connection()
  const { teamSlug } = await params
  return (
    <>
      <h1>TEAM OVERVIEW</h1>
      <ul>
        <li>
          <LinkAccordion href={`/${teamSlug}/myproject`}>Project</LinkAccordion>
        </li>
      </ul>
    </>
  )
}

export default function OverviewPage({
  params,
}: {
  params: Promise<{ teamSlug: string }>
}) {
  return (
    <main>
      <Suspense fallback={<div id="overview-loading">Loading overview...</div>}>
        <DynamicOverview params={params} />
      </Suspense>
    </main>
  )
}

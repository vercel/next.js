import {
  getLaunchChecklist,
  getLiveRollout,
  isKnownRelease,
} from '@/lib/releases'
import { LaunchChecklist, LiveRollout } from './release-panels'
import { notFound } from 'next/navigation'

export const instant = false

export default async function ReleasePage({
  params,
}: PageProps<'/releases/[release]'>) {
  const { release } = await params

  if (!isKnownRelease(release)) {
    notFound()
  }

  const [checklist, rollout] = await Promise.all([
    getLaunchChecklist(),
    getLiveRollout(release),
  ])

  return (
    <main>
      <h1 data-testid="release-heading">Release operations</h1>
      <LaunchChecklist checklist={checklist} />
      <LiveRollout rollout={rollout} />
    </main>
  )
}

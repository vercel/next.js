import type { Instant } from 'next'

export const unstable_instant: Instant = {
  prefetch: 'static',
  samples: [{}],
}

export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>
}) {
  return (
    <main>
      <p>
        When validated in build, params should hang in the static stage when no
        samples are provided
      </p>
      <TestParams params={params} />
    </main>
  )
}

async function TestParams({
  params,
}: {
  params: Promise<Record<string, string>>
}) {
  await params
  return null
}

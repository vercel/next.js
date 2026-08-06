import { EmitRequestInsightsSnapshot } from './snapshot-button'

export const instant = { level: 'experimental-error' }

async function fillCache() {
  'use cache'

  return 'instant insights'
}

export default async function Page() {
  const message = await fetch('data:text/plain,instant insights', {
    cache: 'force-cache',
  }).then((response) => response.text())

  await fillCache()

  return (
    <>
      <p>{message}</p>
      <EmitRequestInsightsSnapshot />
    </>
  )
}

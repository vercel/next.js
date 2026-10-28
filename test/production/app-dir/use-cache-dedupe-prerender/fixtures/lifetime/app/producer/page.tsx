import { Suspense } from 'react'
import { after } from 'next/server'
import { readShortLived, waitForWarmup } from '../../cache'
import { notify } from '../../notify'

async function ShortLived() {
  await waitForWarmup('shared')
  return <p id="short-lived">{await readShortLived('shared')}</p>
}

export default function Page() {
  after(() => notify('producer-finished'))
  return (
    <Suspense fallback={<p id="short-pending">Loading short-lived</p>}>
      <ShortLived />
    </Suspense>
  )
}

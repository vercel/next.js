import { Suspense } from 'react'
import { readShortLived, waitForWarmup } from '../../cache'

async function ShortLived() {
  // Wait until `/warmup` has stored the entry, so that this prerender gets it
  // from the cache handler instead of generating it.
  await waitForWarmup('shared')
  return <p id="short-lived">{await readShortLived('shared')}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p id="short-pending">Loading short-lived</p>}>
      <ShortLived />
    </Suspense>
  )
}

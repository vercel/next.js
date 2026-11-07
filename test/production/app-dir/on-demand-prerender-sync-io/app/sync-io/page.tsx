import { Suspense } from 'react'
import { SyncIO } from '../_components/sync-io'

export default function Page() {
  return (
    <Suspense fallback={<p id="fallback">loading</p>}>
      <SyncIO />
    </Suspense>
  )
}

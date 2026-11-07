import { Suspense } from 'react'
import { SyncIO } from '../_components/sync-io'
import { Client } from './client'

const pendingIterable: AsyncIterable<string> = {
  [Symbol.asyncIterator]() {
    return { next: () => new Promise(() => {}) }
  },
}

export default function Page() {
  return (
    <>
      <Suspense fallback={<p id="fallback">loading</p>}>
        <SyncIO />
      </Suspense>
      {/* React starts serializing this prop after the sync IO has aborted the
          prerender, and it never settles. */}
      <Suspense fallback={null}>
        <Client iterable={pendingIterable} />
      </Suspense>
    </>
  )
}

import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { SyncIO } from '../../_components/sync-io'
import { Client } from './client'

const pendingIterable: AsyncIterable<string> = {
  [Symbol.asyncIterator]() {
    return {
      next(): Promise<IteratorResult<string>> {
        // The iterator ends at build time. React must close it after a
        // revalidation abort.
        if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
          return Promise.resolve({ done: true, value: undefined })
        }
        return new Promise(() => {})
      },
    }
  },
}

export default function Page() {
  return (
    <>
      <SyncIO />
      {/* Flight encounters this iterable after the sync IO aborts the render. */}
      <Client iterable={pendingIterable} />
    </>
  )
}

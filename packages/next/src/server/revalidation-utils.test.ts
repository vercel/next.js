import { createPromiseWithResolvers } from '../shared/lib/promise-with-resolvers'
import type { WorkStore } from './app-render/work-async-storage.external'
import { executeRevalidatesOnClose } from './revalidation-utils'

function createWorkStore(
  pendingRevalidateWrites: Array<Promise<void>> = []
): WorkStore {
  return {
    pendingRevalidateWrites,
    pendingRevalidates: {},
    pendingRevalidatedTags: [],
  } as unknown as WorkStore
}

function createCloseSignal() {
  let close: () => void = () => {
    throw new Error('onClose was not subscribed')
  }
  const onClose = (callback: () => void) => {
    close = callback
  }
  return { onClose, close: () => close() }
}

function trackSettled(promise: Promise<unknown>) {
  const state = { settled: false }
  promise.then(
    () => {
      state.settled = true
    },
    () => {
      state.settled = true
    }
  )
  return state
}

async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
  }
}

describe('executeRevalidatesOnClose', () => {
  it('waits for writes that are added before the response closes', async () => {
    const workStore = createWorkStore()
    const { onClose, close } = createCloseSignal()
    const result = trackSettled(executeRevalidatesOnClose(workStore, onClose))

    const write = createPromiseWithResolvers<void>()
    workStore.pendingRevalidateWrites!.push(write.promise)

    close()
    await flush()
    expect(result.settled).toBe(false)

    write.resolve()
    await flush()
    expect(result.settled).toBe(true)
  })

  it('waits for fetch and unstable_cache revalidations that are added before the response closes', async () => {
    const workStore = createWorkStore()
    const { onClose, close } = createCloseSignal()
    const result = trackSettled(executeRevalidatesOnClose(workStore, onClose))

    const revalidate = createPromiseWithResolvers<void>()
    workStore.pendingRevalidates!['cache-set-key'] = revalidate.promise

    close()
    await flush()
    expect(result.settled).toBe(false)

    revalidate.resolve()
    await flush()
    expect(result.settled).toBe(true)
  })

  it('does not wait for writes that were already present when it was called', async () => {
    const executedWrite = createPromiseWithResolvers<void>()
    const workStore = createWorkStore([executedWrite.promise])
    const { onClose, close } = createCloseSignal()
    const result = trackSettled(executeRevalidatesOnClose(workStore, onClose))

    close()
    await flush()
    expect(result.settled).toBe(true)
  })

  it('waits for writes that are added while executing other writes', async () => {
    const workStore = createWorkStore()
    const { onClose, close } = createCloseSignal()
    const result = trackSettled(executeRevalidatesOnClose(workStore, onClose))

    const nestedWrite = createPromiseWithResolvers<void>()
    const write = createPromiseWithResolvers<void>()
    workStore.pendingRevalidateWrites!.push(
      write.promise.then(() => {
        workStore.pendingRevalidateWrites!.push(nestedWrite.promise)
      })
    )

    close()
    write.resolve()
    await flush()
    expect(result.settled).toBe(false)

    nestedWrite.resolve()
    await flush()
    expect(result.settled).toBe(true)
  })

  it('does not settle before the response closes', async () => {
    const workStore = createWorkStore()
    const { onClose } = createCloseSignal()
    const result = trackSettled(executeRevalidatesOnClose(workStore, onClose))

    workStore.pendingRevalidateWrites!.push(Promise.resolve())
    await flush()
    expect(result.settled).toBe(false)
  })

  it('settles once the response closes when nothing was added', async () => {
    const workStore = createWorkStore()
    const { onClose, close } = createCloseSignal()
    const result = trackSettled(executeRevalidatesOnClose(workStore, onClose))

    close()
    await flush()
    expect(result.settled).toBe(true)
  })
})

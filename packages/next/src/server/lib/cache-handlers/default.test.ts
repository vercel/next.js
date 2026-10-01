/**
 * @jest-environment node
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { runInNewContext } from 'node:vm'
import { setFlagsFromString } from 'node:v8'
import { createDefaultCacheHandler } from './default'
import type { CacheEntry, CacheHandler } from './types'

setFlagsFromString('--expose-gc')
const forceGarbageCollection = runInNewContext('gc') as () => void

describe('default use cache handler', () => {
  it('does not retain the async context that populated an entry', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    const requestStoreRef = await runInRequestContext(() =>
      populateCache(handler)
    )

    await expectCollected(requestStoreRef)

    expect(await readCache(handler)).toBe('cached value')
  })

  it('does not retain the async context that read an entry', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    await populateCache(handler)

    const requestStoreRef = await runInRequestContext(async () => {
      expect(await readCache(handler)).toBe('cached value')
    })

    await expectCollected(requestStoreRef)
  })
})

async function runInRequestContext(
  callback: () => Promise<void>
): Promise<WeakRef<object>> {
  const requestStorage = new AsyncLocalStorage<object>()
  let requestStoreRef: WeakRef<object> | undefined

  await requestStorage.run({ requestId: 'request' }, async () => {
    const requestStore = requestStorage.getStore()

    if (!requestStore) {
      throw new Error('Expected a request store')
    }

    requestStoreRef = new WeakRef(requestStore)
    await callback()
  })

  if (!requestStoreRef) {
    throw new Error('Expected a request store reference')
  }

  return requestStoreRef
}

async function populateCache(handler: CacheHandler): Promise<void> {
  const entry: CacheEntry = {
    value: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('cached value'))
        controller.close()
      },
    }),
    tags: [],
    stale: 60,
    timestamp: Date.now(),
    expire: 120,
    revalidate: 60,
  }

  await handler.set('key', Promise.resolve(entry))
}

async function readCache(handler: CacheHandler): Promise<string> {
  const entry = await handler.get('key', [])
  if (!entry) {
    throw new Error('Expected a cache entry')
  }

  return new Response(entry.value).text()
}

async function expectCollected(ref: WeakRef<object>): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    forceGarbageCollection()
    await new Promise<void>((resolve) => setImmediate(resolve))
  }

  expect(ref.deref()).toBeUndefined()
}

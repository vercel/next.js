import { retry } from 'next-test-utils'
import { createTestDataServer } from 'test-data-service/writer'

/**
 * This service records fixture requests and controls when their responses
 * complete. `hold(key)` pauses responses for that key. A `wait:<key>` request
 * waits until the service receives a request for `key`. It does not wait for
 * that request's response to complete.
 */
export function createDataService() {
  const requestedKeys: string[] = []
  const heldResponseKeys = new Set<string>()
  const pendingResponsesByKey = new Map<
    string,
    Array<(value?: string) => void>
  >()
  const requestWaitersByKey = new Map<string, Array<() => void>>()

  const server = createTestDataServer((key, response) => {
    requestedKeys.push(key)
    if (key.startsWith('wait:')) {
      const event = key.slice('wait:'.length)
      if (requestedKeys.includes(event)) {
        response.resolve()
      } else {
        const callbacks = requestWaitersByKey.get(event) ?? []
        callbacks.push(() => response.resolve())
        requestWaitersByKey.set(event, callbacks)
      }
      return
    }

    requestWaitersByKey.get(key)?.forEach((resolve) => resolve())
    requestWaitersByKey.delete(key)
    if (heldResponseKeys.has(key)) {
      const callbacks = pendingResponsesByKey.get(key) ?? []
      callbacks.push((value) => response.resolve(value))
      pendingResponsesByKey.set(key, callbacks)
    } else {
      response.resolve()
    }
  })

  function releaseAll() {
    heldResponseKeys.clear()
    for (const callbacks of pendingResponsesByKey.values()) {
      callbacks.forEach((resolve) => resolve())
    }
    for (const callbacks of requestWaitersByKey.values()) {
      callbacks.forEach((resolve) => resolve())
    }
    pendingResponsesByKey.clear()
    requestWaitersByKey.clear()
  }

  return {
    server,
    requestedKeys,
    hold(key: string) {
      heldResponseKeys.add(key)
    },
    release(key: string, value?: string) {
      heldResponseKeys.delete(key)
      pendingResponsesByKey.get(key)?.forEach((resolve) => resolve(value))
      pendingResponsesByKey.delete(key)
    },
    async waitForRequest(key: string) {
      await retry(
        () => {
          expect(requestedKeys).toContain(key)
        },
        30_000,
        100
      )
    },
    releaseAll,
    close() {
      releaseAll()
      server.close()
    },
  }
}

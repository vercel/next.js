import { record } from '../storage'

const EVENT_VERSION = 'NEXT_VERSION'

export function recordVersion({ isDev = false } = {}) {
  // This should be an invariant, if it fails our build tooling is broken.
  if (typeof process.env.__NEXT_VERSION !== 'string') {
    return Promise.resolve()
  }

  return record({
    eventName: EVENT_VERSION,
    payload: {
      version: process.env.__NEXT_VERSION,
      nodeVersion: process.version,
      isDevelopment: isDev,
    },
  })
}

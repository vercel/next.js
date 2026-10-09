/**
 * Emulates the one runtime difference that makes a Bun build
 * (`bun --bun next build`) report client hook rejections that Node builds
 * suppress: Bun does not propagate the AsyncLocalStorage context into
 * `unhandledRejection` listeners, so Next.js' unhandled rejection filter
 * (`server/node-environment-extensions/unhandled-rejection.external.tsx`)
 * cannot see the work unit store of the aborted prerender.
 *
 * Verified with Bun 1.4.2:
 *
 *   const als = new AsyncLocalStorage()
 *   process.on('unhandledRejection', () => als.getStore())
 *   als.run({}, () => { Promise.reject(new Error('x')) })
 *   // node -> { }            (context is propagated)
 *   // bun  -> undefined      (context is lost)
 *
 * Everything else about the build is a plain Node.js build, which keeps this
 * fixture runnable in CI without a Bun installation.
 */
const { AsyncLocalStorage } = require('node:async_hooks')

let inUnhandledRejection = false

const originalGetStore = AsyncLocalStorage.prototype.getStore
AsyncLocalStorage.prototype.getStore = function getStore() {
  if (inUnhandledRejection) {
    return undefined
  }
  return originalGetStore.call(this)
}

const originalEmit = process.emit
process.emit = function emit(event, ...args) {
  if (event === 'unhandledRejection') {
    inUnhandledRejection = true
    try {
      return originalEmit.call(this, event, ...args)
    } finally {
      inUnhandledRejection = false
    }
  }
  return originalEmit.call(this, event, ...args)
}

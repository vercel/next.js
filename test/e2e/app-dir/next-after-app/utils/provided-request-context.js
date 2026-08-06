import { cliLog } from './log'

export function injectRequestContext() {
  const _globalThis = globalThis

  /** @type {import('next/dist/server/after/builtin-request-context').BuiltinRequestContext} */
  _globalThis[Symbol.for('@next/request-context')] = {
    get() {
      return {
        waitUntil(/** @type {Promise<any>} */ promise) {
          cliLog('waitUntil from "@next/request-context" was called')
          promise.catch((err) => {
            console.error(err)
          })
        },
      }
    },
  }

  return () => {
    delete _globalThis[Symbol.for('@next/request-context')]
  }
}

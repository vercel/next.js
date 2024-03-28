import type { WaitUntilFn } from './shared'

export function getBuiltinWaitUntil(): WaitUntilFn {
  const _globalThis = globalThis as GlobalThisWithRequestContext
  const ctx = _globalThis[INTERNAL_REQUEST_CONTEXT_SYMBOL]
  const waitUntilImpl = ctx?.get()?.waitUntil
  if (!waitUntilImpl) {
    throw new Error(`Could not access waitUntil from '@vercel/request-context'`)
  }
  return waitUntilImpl
}

const INTERNAL_REQUEST_CONTEXT_SYMBOL = Symbol.for('@vercel/request-context')

type GlobalThisWithRequestContext = typeof globalThis & {
  [INTERNAL_REQUEST_CONTEXT_SYMBOL]?: MinimalModeRequestContext
}

type MinimalModeRequestContext = {
  get(): { waitUntil: WaitUntilFn } | undefined
}

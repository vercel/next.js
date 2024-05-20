export type WaitUntil = (promise: Promise<any>) => void

export function getBuiltinWaitUntil(): WaitUntil | undefined {
  const _globalThis = globalThis as GlobalThisWithRequestContext
  const ctx =
    _globalThis[NEXT_REQUEST_CONTEXT_SYMBOL] ??
    _globalThis[VERCEL_REQUEST_CONTEXT_SYMBOL]
  return ctx?.get()?.waitUntil
}

/** This should be considered unstable until `unstable_after` is stablized. */
const NEXT_REQUEST_CONTEXT_SYMBOL = Symbol.for('@next/request-context')

// TODO(after): this is a temporary workaround.
// Remove this when vercel builder is updated to provide '@next/request-context'.
const VERCEL_REQUEST_CONTEXT_SYMBOL = Symbol.for('@vercel/request-context')

type GlobalThisWithRequestContext = typeof globalThis & {
  [NEXT_REQUEST_CONTEXT_SYMBOL]?: RequestContext
  /** @deprecated */
  [VERCEL_REQUEST_CONTEXT_SYMBOL]?: RequestContext
}

/** This should be considered unstable until `unstable_after` is stablized. */
type RequestContext = {
  get(): { waitUntil: WaitUntil } | undefined
}

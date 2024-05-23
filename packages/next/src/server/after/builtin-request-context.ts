export function getBuiltinRequestContext():
  | BuiltinRequestContextValue
  | undefined {
  const _globalThis = globalThis as GlobalThisWithRequestContext
  const ctx =
    _globalThis[NEXT_REQUEST_CONTEXT_SYMBOL] ??
    _globalThis[VERCEL_REQUEST_CONTEXT_SYMBOL]
  return ctx?.get()
}

/** This should be considered unstable until `unstable_after` is stablized. */
const NEXT_REQUEST_CONTEXT_SYMBOL = Symbol.for('@next/request-context')

// TODO(after): this is a temporary workaround.
// Remove this when vercel builder is updated to provide '@next/request-context'.
const VERCEL_REQUEST_CONTEXT_SYMBOL = Symbol.for('@vercel/request-context')

type GlobalThisWithRequestContext = typeof globalThis & {
  [NEXT_REQUEST_CONTEXT_SYMBOL]?: BuiltinRequestContext
  /** @deprecated */
  [VERCEL_REQUEST_CONTEXT_SYMBOL]?: BuiltinRequestContext
}

/** A request context provided by the platform.
 * It should be considered unstable until `unstable_after` is stablized. */
export type BuiltinRequestContext = {
  get(): BuiltinRequestContextValue | undefined
}

export type BuiltinRequestContextValue = { waitUntil?: WaitUntil }
export type WaitUntil = (promise: Promise<any>) => void

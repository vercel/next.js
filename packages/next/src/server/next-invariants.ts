/**
 * Process-level configuration values that are set once at startup and never
 * change. In bundled code, `__NEXT_INVARIANTS__.trailingSlash` etc. are
 * statically replaced by defineEnv at compile time. In external (non-bundled)
 * server code, the bare identifier resolves to the frozen object on globalThis.
 *
 * A Proxy sentinel is installed early in node-environment-baseline.ts that
 * throws if any property is accessed before `initializeNextInvariants` is
 * called. This catches ordering bugs where external code tries to read config
 * before the server or build has resolved it.
 */

import type { NextConfigRuntime } from './config-shared'

// All invariant values must be JSON-serializable so defineEnv can statically
// replace them in bundled code. The index signature enforces this at compile
// time — adding a non-serializable property (RegExp, Map, function, etc.)
// will produce a type error.
type JsonSerializableValue =
  | string
  | number
  | boolean
  | null
  | JsonSerializableValue[]
  | { readonly [key: string]: JsonSerializableValue }

export interface NextInvariants {
  readonly [key: string]: JsonSerializableValue
  readonly isDevServer: boolean
  readonly trailingSlash: boolean
  readonly experimentalOptimisticRouting: boolean
}

let initialized = false

/**
 * Replace the Proxy sentinel on globalThis with the real frozen config object.
 * Idempotent — the first call wins, subsequent calls are no-ops. This allows
 * multiple entry points (getDefineEnv, NextNodeServer, export worker) to call
 * it without worrying about ordering.
 */
export function initializeNextInvariants(
  config: NextConfigRuntime,
  isDevServer: boolean
): void {
  if (initialized) {
    return
  }
  initialized = true
  ;(globalThis as any).__NEXT_INVARIANTS__ = Object.freeze({
    isDevServer,
    trailingSlash: config.trailingSlash,
    experimentalOptimisticRouting:
      config.experimental.optimisticRouting ?? false,
  })
}

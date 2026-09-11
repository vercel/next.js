/**
 * Registers a local module in a share scope.
 *
 * Generated provider entries call this function with code equivalent to:
 *
 * ```js
 * provideShared({
 *   shareKey: 'react',
 *   version: '19.1.0',
 *   factory: () => reactNamespace,
 *   eager: true,
 * })
 * ```
 *
 * A remote passes its private `scope`; a host omits it and registers in the named runtime scope.
 */
import {
  getShareScope,
  register,
  registerShared,
  registerSharedGetter,
  type ShareScope,
  type SharedModuleFactory,
  type SharedModuleGetter,
} from './share-runtime'

interface BaseProvideSharedOptions {
  scope?: ShareScope
  shareScope?: string
  shareKey: string
  version: string | false
  eager?: boolean
  from?: string
}

export type ProvideSharedOptions = BaseProvideSharedOptions &
  (
    | { factory: SharedModuleFactory; get?: never }
    | { factory?: never; get: SharedModuleGetter }
  )

export function provideShared({
  scope,
  shareScope = 'default',
  shareKey,
  version,
  factory,
  get,
  eager = false,
  from,
}: ProvideSharedOptions): void {
  // Webpack uses `0` as the key for an explicitly unversioned provider.
  const normalizedVersion = version || '0'

  if (get) {
    registerSharedGetter(
      scope || getShareScope(shareScope),
      shareKey,
      normalizedVersion,
      get,
      eager,
      from
    )
    return
  }

  if (scope) {
    registerShared(scope, shareKey, normalizedVersion, factory, eager, from)
  } else {
    register(shareKey, normalizedVersion, factory, eager, shareScope, from)
  }
}

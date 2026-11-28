/**
 * Storage and registration primitives for shared modules.
 *
 * The shape intentionally matches the object exchanged through Webpack's `container.init()`:
 *
 * ```js
 * scope.react['19.1.0'] = {
 *   get: () => () => reactNamespace,
 *   from: 'host',
 *   eager: true,
 * }
 * ```
 *
 * Selection by version lives in `consume-shared.ts`; this file only owns safe dictionaries,
 * registration, and scope merging.
 */
export type SharedModuleFactory = () => unknown | Promise<unknown>
export type SharedModuleGetter = () =>
  | SharedModuleFactory
  | Promise<SharedModuleFactory>

export interface SharedEntry {
  get: SharedModuleGetter
  from: string | undefined
  eager: boolean
  loaded?: boolean | number
}

export type SharedVersions = Record<string, SharedEntry>
export type ShareScope = Record<string, SharedVersions>
type ShareScopeMap = Record<string, ShareScope>

const dangerousPropertyNames = new Set([
  '__proto__',
  'prototype',
  'constructor',
])
const reservedContainerNames = new Set([
  'window',
  'self',
  'globalThis',
  'document',
  'location',
  'top',
  'parent',
  'frames',
  'history',
  'navigator',
  'name',
  'alert',
  'TURBOPACK',
  'TURBOPACK_ASSET_SUFFIX',
  'TURBOPACK_CHUNK_LISTS',
  'TURBOPACK_CHUNK_UPDATE_LISTENERS',
  '__webpack_share_scopes__',
  '__webpack_init_sharing__',
  '__turbopack_share_scopes__',
  '__turbopack_init_sharing__',
  '__TURBOPACK_MF_CONTAINERS__',
])

export function createDictionary<T>(): Record<string, T> {
  // Share keys come from configuration and from external containers. A null prototype prevents
  // names such as `toString` from accidentally reading properties inherited from Object.prototype.
  return Object.create(null) as Record<string, T>
}

function hasOwn(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function setOwn<T>(object: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(object, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  })
}

export function isSafeModuleFederationPropertyName(name: string): boolean {
  return name.length > 0 && !dangerousPropertyNames.has(name)
}

export function isSafeModuleFederationContainerName(name: string): boolean {
  return (
    /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) &&
    isSafeModuleFederationPropertyName(name) &&
    !reservedContainerNames.has(name)
  )
}

function assertSafePropertyName(name: string, kind: string): void {
  if (!isSafeModuleFederationPropertyName(name)) {
    throw new Error(`Invalid Module Federation ${kind} "${name}"`)
  }
}

// Like Webpack's __webpack_share_scopes__, these belong to one compiled
// runtime. A container adopts the exact host-owned object passed to init().
// Keeping this map module-local prevents independent hosts on the same page
// from clobbering each other's default scope.
export const shareScopeMap: ShareScopeMap = createDictionary<ShareScope>()
const initTokens = new Map<string, object>()

export function createShareScope(): ShareScope {
  return createDictionary<SharedVersions>()
}

export function getShareScope(name: string = 'default'): ShareScope {
  assertSafePropertyName(name, 'share scope')
  if (hasOwn(shareScopeMap, name)) return shareScopeMap[name]!

  const scope = createShareScope()
  setOwn(shareScopeMap, name, scope)
  return scope
}

export function setShareScope(name: string, scope: ShareScope): void {
  assertSafePropertyName(name, 'share scope')
  const existing = hasOwn(shareScopeMap, name) ? shareScopeMap[name] : undefined
  if (existing && existing !== scope) {
    throw new Error(
      `Share scope "${name}" has already been initialized with a different object`
    )
  }
  setOwn(shareScopeMap, name, scope)
}

export function getSharedVersions(
  scope: ShareScope,
  name: string
): SharedVersions | undefined {
  assertSafePropertyName(name, 'shared module key')
  return hasOwn(scope, name) ? scope[name] : undefined
}

export function getSharedVersionEntries(
  versions: SharedVersions
): Array<[string, SharedEntry]> {
  const entries = Object.entries(versions)
  for (const [version] of entries) {
    assertSafePropertyName(version, 'shared module version')
  }
  return entries
}

function shouldReplaceSharedEntry(
  current: SharedEntry | undefined,
  candidate: SharedEntry
): boolean {
  // Keep a loaded provider stable. Before anything is loaded, prefer an eager provider and then
  // use `from` as a deterministic tie-breaker, matching Webpack's share-scope behavior.
  return (
    !current ||
    (!current.loaded &&
      (candidate.eager !== current.eager
        ? candidate.eager
        : candidate.from !== undefined &&
          current.from !== undefined &&
          candidate.from > current.from))
  )
}

export function mergeShareScopes(target: ShareScope, source: ShareScope): void {
  // `target` may come from Webpack and therefore may be a normal object. Always use own-property
  // reads and define own values instead of trusting its prototype chain.
  for (const [key, sourceVersions] of Object.entries(source)) {
    assertSafePropertyName(key, 'shared module key')
    let targetVersions = getSharedVersions(target, key)
    if (!targetVersions) {
      targetVersions = createDictionary<SharedEntry>()
      setOwn(target, key, targetVersions)
    }

    for (const [version, entry] of getSharedVersionEntries(sourceVersions)) {
      const current = hasOwn(targetVersions, version)
        ? targetVersions[version]
        : undefined
      if (shouldReplaceSharedEntry(current, entry)) {
        setOwn(targetVersions, version, entry)
      }
    }
  }
}

export function registerSharedGetter(
  scope: ShareScope,
  name: string,
  version: string,
  get: SharedModuleGetter,
  eager: boolean = false,
  from: string = 'turbopack'
): void {
  assertSafePropertyName(name, 'shared module key')
  assertSafePropertyName(version, 'shared module version')

  let versions = getSharedVersions(scope, name)
  if (!versions) {
    versions = createDictionary<SharedEntry>()
    setOwn(scope, name, versions)
  }

  const current = hasOwn(versions, version) ? versions[version] : undefined
  const candidate: SharedEntry = { get, from, eager }
  if (shouldReplaceSharedEntry(current, candidate)) {
    setOwn(versions, version, candidate)
  }
}

export function registerShared(
  scope: ShareScope,
  name: string,
  version: string,
  factory: SharedModuleFactory,
  eager: boolean = false,
  from: string = 'turbopack'
): void {
  // Webpack share entries expose a getter for the module factory. Keeping
  // that two-step ABI is what lets both bundlers exchange a share scope.
  registerSharedGetter(scope, name, version, () => factory, eager, from)
}

export function register(
  name: string,
  version: string,
  factory: SharedModuleFactory,
  eager: boolean = false,
  scopeName: string = 'default',
  from?: string
): void {
  registerShared(getShareScope(scopeName), name, version, factory, eager, from)
}

export function initializeSharing(
  name: string = 'default',
  initScope: unknown[] = []
): void {
  getShareScope(name)

  // Webpack passes this array through container initialization to break
  // cycles. Each compiled runtime owns one token per share scope.
  let token = initTokens.get(name)
  if (!token) {
    token = {}
    initTokens.set(name, token)
  }
  if (initScope.includes(token)) return
  initScope.push(token)
}

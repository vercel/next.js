import { assertScopeActive } from '../runner/async-context'
import type { TurbopackImportContext } from '../runner/imports'

type ModuleId = string | number
export interface ModuleCacheContext extends TurbopackImportContext {
  M: Map<unknown, unknown>
  m: { id: ModuleId }
}
export interface CompiledModuleCacheManifest {
  version: 1
  resettable: readonly ModuleId[]
  protected: readonly ModuleId[]
  staticMocks?: readonly { initial: ModuleId; provider: ModuleId }[]
}
interface State {
  context: ModuleCacheContext
  modules: ModuleCacheContext['c']
  factories: ModuleCacheContext['M']
  ids: readonly ModuleId[]
  staticMocks: ReadonlyMap<ModuleId, ModuleId>
  closed: boolean
  retire(
    modules: Iterable<{ exports: unknown; namespaceObject?: unknown }>
  ): void
}
let active: State | undefined

function validId(id: unknown): id is ModuleId {
  return typeof id === 'string'
    ? id.length > 0
    : typeof id === 'number' && Number.isSafeInteger(id) && id >= 0
}

/** Called by the emitted Node template with IDs generated from its actual graph. */
export function initializeModuleCache(
  context: ModuleCacheContext,
  manifest: CompiledModuleCacheManifest,
  retire: State['retire']
) {
  if (active)
    throw new Error('A compiled module cache owner is already active.')
  if (
    !(context.c instanceof Map) ||
    !(context.M instanceof Map) ||
    !validId(context.m?.id) ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.resettable) ||
    !manifest.resettable.length ||
    !Array.isArray(manifest.protected) ||
    typeof retire !== 'function'
  )
    throw new Error('Invalid compiler-owned module cache context or manifest.')
  const protectedIds = new Set<ModuleId>([context.m.id, ...manifest.protected])
  const ids = [...manifest.resettable]
  if (
    ids.some((id) => !validId(id)) ||
    manifest.protected.some((id) => !validId(id)) ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => protectedIds.has(id))
  )
    throw new Error(
      'Resettable module IDs overlap protected runtime identities.'
    )
  const staticMocks = new Map<ModuleId, ModuleId>()
  const staticProviders = new Set<ModuleId>()
  if (
    manifest.staticMocks !== undefined &&
    !Array.isArray(manifest.staticMocks)
  )
    throw new Error('Invalid compiler-owned static mock pairs.')
  for (const pair of manifest.staticMocks ?? []) {
    if (
      !pair ||
      typeof pair !== 'object' ||
      Array.isArray(pair) ||
      !validId(pair.initial) ||
      !validId(pair.provider) ||
      pair.initial === pair.provider ||
      pair.initial === context.m.id ||
      !protectedIds.has(pair.initial) ||
      !ids.includes(pair.provider) ||
      staticMocks.has(pair.initial) ||
      staticProviders.has(pair.provider) ||
      typeof context.M.get(pair.initial) !== 'function' ||
      typeof context.M.get(pair.provider) !== 'function'
    )
      throw new Error('Invalid compiler-owned static mock pairs.')
    staticMocks.set(pair.initial, pair.provider)
    staticProviders.add(pair.provider)
  }
  const state: State = {
    context,
    modules: context.c,
    factories: context.M,
    ids,
    staticMocks,
    closed: false,
    retire,
  }
  active = state
  return {
    dispose() {
      state.closed = true
      if (active === state) active = undefined
    },
  }
}

/** Native runtime targets must belong to the same compiler-owned reset manifest. */
export function assertNativeModuleOwnership(
  context: ModuleCacheContext,
  ids: readonly ModuleId[],
  initial?: ModuleId
): void {
  const state = active
  if (
    !state ||
    state.closed ||
    state.context !== context ||
    state.modules !== context.c ||
    state.factories !== context.M ||
    !ids.length ||
    ids.some((id) => !validId(id) || !state.ids.includes(id)) ||
    (initial !== undefined &&
      (!validId(initial) || state.staticMocks.get(initial) !== ids[0]))
  ) {
    throw new Error(
      'Native runtime target IDs are not owned by this module cache.'
    )
  }
}

/** Compiled static edges share the existing exact reset-cache owner. */
export function assertRuntimeModuleOwnership(
  context: ModuleCacheContext,
  ids: readonly ModuleId[]
): void {
  const state = active
  if (
    !state ||
    state.closed ||
    state.context !== context ||
    state.modules !== context.c ||
    state.factories !== context.M ||
    !ids.length ||
    ids.some((id) => !validId(id) || !state.ids.includes(id))
  )
    throw new Error(
      'Runtime static import IDs are not owned by this module cache.'
    )
}

/** Reset actual evaluated modules, preserving factories, loaders and held namespaces. */
export function resetModules(): void {
  assertScopeActive()
  const state = active
  if (!state || state.closed)
    throw new Error(
      'vi.resetModules requires an active compiler-owned module cache.'
    )
  if (state.context.c !== state.modules || state.context.M !== state.factories)
    throw new Error(
      'The compiled module cache owner changed after initialization.'
    )
  const removed: { exports: unknown; namespaceObject?: unknown }[] = []
  for (const id of state.ids) {
    const module = state.modules.get(id)
    if (!module) continue
    if (typeof state.factories.get(id) !== 'function')
      throw new Error(
        'Cannot reset an evaluated module without its retained native factory.'
      )
    removed.push(module)
  }
  // Keep evicted top-level-await work visible to the same file's import tracker.
  // Retire before mutation so a failed ownership handoff leaves the cache intact.
  state.retire(removed)
  for (const id of state.ids) state.modules.delete(id)
}

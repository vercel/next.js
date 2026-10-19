import { AsyncLocalStorage } from 'node:async_hooks'
import { assertScopeActive } from '../runner/async-context'
import { initializeModuleMocking } from './runtime'
import type { RegistrationInputOwner } from './registry'
import type { ModuleCacheContext } from './module-cache'

type ModuleId = string | number
const NativeMap = Map
const nativeMapGet = Map.prototype.get

/** IDs are emitted from the actual processed input graphs, never source text. */
export interface CompiledMockInputs {
  version: 1
  inputs: number
  aliases: readonly (readonly ModuleId[])[]
  protected: readonly ModuleId[]
}

interface State {
  context: ModuleCacheContext
  modules: ModuleCacheContext['c']
  factories: ModuleCacheContext['M']
  inputCount: number
  owners: Map<number, RegistrationInputOwner>
  storage: AsyncLocalStorage<RegistrationInputOwner>
  closed: boolean
}

let active: State | undefined
const ownedCaches = new WeakSet<Map<unknown, unknown>>()

function validId(id: unknown): id is ModuleId {
  return typeof id === 'string'
    ? id.length > 0
    : typeof id === 'number' && Number.isSafeInteger(id) && id >= 0
}

/**
 * Staged resolver contexts keep earlier evaluated user modules in one native
 * cache. Intercept that cache's reads so native reexports, require and dynamic
 * loaders retain the same first evaluation, including their actual namespaces.
 * Each compiler-issued mock generation stays distinct; unchanged generations
 * share their native namespace. Runtime modules never enter alias groups.
 */
export function initializeCompiledMockInputs(
  context: ModuleCacheContext,
  manifest: CompiledMockInputs,
  options: { onLateFailure?: (error: Error) => void } = {}
): { dispose(): void } {
  if (active || ownedCaches.has(context.c))
    throw new Error('A compiled mock input owner is already active.')
  if (
    manifest.version !== 1 ||
    !Number.isSafeInteger(manifest.inputs) ||
    manifest.inputs < 2 ||
    !(context.c instanceof NativeMap) ||
    !(context.M instanceof NativeMap) ||
    !validId(context.m?.id) ||
    !Array.isArray(manifest.aliases) ||
    !Array.isArray(manifest.protected)
  )
    throw new Error('Invalid compiler-owned mock input manifest.')

  const protectedIds = new Set([context.m.id, ...manifest.protected])
  const groups = new Map<ModuleId, readonly ModuleId[]>()
  if (manifest.protected.some((id) => !validId(id)))
    throw new Error('Invalid protected mock input module identity.')
  for (const ids of manifest.aliases) {
    if (
      !Array.isArray(ids) ||
      ids.length < 2 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !validId(id) || protectedIds.has(id) || groups.has(id))
    )
      throw new Error('Invalid native module aliases for compiled mock inputs.')
    const group = [...ids]
    for (const id of group) groups.set(id, group)
  }

  const modules = context.c
  const factories = context.M
  const descriptor = Object.getOwnPropertyDescriptor(modules, 'get')
  if (descriptor || modules.get !== nativeMapGet)
    throw new Error('The native module cache already has a custom reader.')
  const state: State = {
    context,
    modules,
    factories,
    inputCount: manifest.inputs,
    owners: new Map(),
    storage: new AsyncLocalStorage(),
    closed: false,
  }
  const assertOwner = () => {
    if (
      state.closed ||
      state.context.c !== modules ||
      state.context.M !== factories
    )
      throw new Error(
        'The compiled mock input cache owner is closed or changed.'
      )
  }
  const get = function (this: typeof modules, id: unknown) {
    assertOwner()
    if (this !== modules)
      throw new Error(
        'Compiled input aliases cannot borrow another module cache.'
      )
    const group = validId(id) ? groups.get(id) : undefined
    if (!group) return nativeMapGet.call(modules, id)
    let found: ReturnType<typeof modules.get>
    for (const candidate of group) {
      const module = nativeMapGet.call(modules, candidate)
      if (!module) continue
      if (found && found !== module)
        throw new Error(
          'Compiled mock inputs contain duplicate module evaluations.'
        )
      if (typeof nativeMapGet.call(factories, candidate) !== 'function')
        throw new Error('An aliased native module lost its retained factory.')
      found = module
    }
    return found
  }
  Object.defineProperty(modules, 'get', {
    value: get,
    writable: true,
    configurable: true,
  })
  let binding: ReturnType<typeof initializeModuleMocking>
  try {
    binding = initializeModuleMocking({
      ...options,
      registrationInput: () => state.storage.getStore(),
    })
  } catch (error) {
    Reflect.deleteProperty(modules, 'get')
    throw error
  }
  ownedCaches.add(modules)
  active = state
  return {
    dispose() {
      if (state.closed) return
      state.closed = true
      if (active === state) active = undefined
      const unfinished = [...state.owners.values()].some(
        (input) => !input.closed
      )
      const changed =
        state.context.c !== modules || state.context.M !== factories
      for (const input of state.owners.values()) input.closed = true
      ownedCaches.delete(modules)
      try {
        if (modules.get !== get)
          throw new Error(
            'The compiled mock input cache reader changed before disposal.'
          )
        Reflect.deleteProperty(modules, 'get')
      } finally {
        binding.dispose()
      }
      if (unfinished)
        throw new Error(
          'Compiled mock input loading was unfinished during cleanup.'
        )
      if (changed)
        throw new Error(
          'The compiled mock input cache owner changed before disposal.'
        )
    },
  }
}

/** Called around the emitted setup/spec loaders, inside their collection scope. */
export async function loadCompiledMockInput<T>(
  index: number,
  load: () => T | Promise<T>
): Promise<T> {
  assertScopeActive()
  const state = active
  if (
    !state ||
    state.closed ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index >= state.inputCount ||
    state.owners.has(index)
  )
    throw new Error('Invalid or repeated compiled mock input loader.')
  if (index === state.inputCount - 1) {
    for (let setup = 0; setup < index; setup++) {
      if (!state.owners.get(setup)?.closed)
        throw new Error('Compiled spec loading must follow all setup inputs.')
    }
  }
  const owner: RegistrationInputOwner = {
    index,
    closed: false,
    evaluating: false,
  }
  state.owners.set(index, owner)
  try {
    return await state.storage.run(owner, load)
  } finally {
    owner.closed = true
  }
}

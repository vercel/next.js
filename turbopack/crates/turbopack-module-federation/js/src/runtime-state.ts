/**
 * State shared by every copy of the Turbopack Module Federation runtime on a page.
 *
 * A host and several remote entries can each contain this runtime. `Symbol.for` lets those copies
 * reuse script loads and container registrations without exposing Webpack's private runtime
 * globals or evaluating the same remote entry twice.
 */
const MODULE_FEDERATION_STATE_VERSION = 2 as const

export const MODULE_FEDERATION_STATE_SYMBOL = Symbol.for(
  `turbopack.module-federation.runtime.v${MODULE_FEDERATION_STATE_VERSION}`
)

export interface ModuleFederationRuntimeState {
  readonly version: typeof MODULE_FEDERATION_STATE_VERSION
  readonly scriptLoads: Map<string, Promise<void>>
  readonly scriptElements: Map<string, HTMLScriptElement>
  readonly remoteContainers: Map<string, Promise<unknown>>
  readonly containers: Map<string, unknown>
}

const globalObject = globalThis as unknown as Record<PropertyKey, unknown>

function createRuntimeState(): ModuleFederationRuntimeState {
  return {
    version: MODULE_FEDERATION_STATE_VERSION,
    scriptLoads: new Map(),
    scriptElements: new Map(),
    remoteContainers: new Map(),
    containers: new Map(),
  }
}

function isRuntimeState(value: unknown): value is ModuleFederationRuntimeState {
  if (!value || typeof value !== 'object') return false

  const state = value as Partial<ModuleFederationRuntimeState>
  return (
    state.version === MODULE_FEDERATION_STATE_VERSION &&
    state.scriptLoads instanceof Map &&
    state.scriptElements instanceof Map &&
    state.remoteContainers instanceof Map &&
    state.containers instanceof Map
  )
}

function initializeRuntimeState(): ModuleFederationRuntimeState {
  const existing = globalObject[MODULE_FEDERATION_STATE_SYMBOL]
  if (existing !== undefined) {
    if (!isRuntimeState(existing)) {
      throw new Error(
        'The Turbopack Module Federation runtime state is incompatible with this runtime version'
      )
    }
    return existing
  }

  const state = createRuntimeState()
  // Install a non-enumerable value so application code does not encounter this state during normal
  // global-object iteration. A versioned symbol lets a future incompatible runtime fail clearly.
  Object.defineProperty(globalObject, MODULE_FEDERATION_STATE_SYMBOL, {
    configurable: false,
    enumerable: false,
    value: state,
    writable: false,
  })
  return state
}

export const moduleFederationRuntimeState = initializeRuntimeState()

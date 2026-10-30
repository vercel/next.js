/**
 * Creates the `{ get, init }` object published by a remote entry.
 *
 * For a container named `catalog`, generated code effectively does:
 *
 * ```js
 * globalThis.catalog = createContainer('catalog', 'default', {
 *   './Button': () => import('./Button').then((module) => () => module),
 * })
 * ```
 *
 * Webpack and Turbopack hosts consume the same two methods: `init` exchanges shared modules and
 * `get` returns the factory for an exposed module.
 */
import {
  createShareScope,
  initializeSharing,
  isSafeModuleFederationContainerName,
  isSafeModuleFederationPropertyName,
  mergeShareScopes,
  setShareScope,
  type ShareScope,
} from './share-runtime'
import { setCurrentRemoteGetScope } from './remote-scope'
import { moduleFederationRuntimeState } from './runtime-state'

export type ExposedModuleFactory = () => unknown
export type ExposedModuleLoader = () => Promise<ExposedModuleFactory>

export interface Container {
  init(
    shareScope: ShareScope,
    initScope?: unknown[]
  ): unknown | Promise<unknown>
  get(request: string, getScope?: unknown): Promise<ExposedModuleFactory>
}

const globalObject = globalThis as unknown as Record<string, unknown>

function hasOwn(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function isShareScope(value: unknown): value is ShareScope {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value !== Object.prototype &&
    value !== Function.prototype
  )
}

export function createContainer(
  name: string,
  shareScopeName: string,
  moduleMap: Record<string, ExposedModuleLoader>,
  options?: {
    libraryType?: 'var'
    uniqueName?: string
    localShareScope?: ShareScope
  }
): Container {
  if (!isSafeModuleFederationContainerName(name)) {
    throw new Error(`Invalid Module Federation container name "${name}"`)
  }
  if (!isSafeModuleFederationPropertyName(shareScopeName)) {
    throw new Error(`Invalid Module Federation share scope "${shareScopeName}"`)
  }
  if (hasOwn(globalObject, name)) {
    throw new Error(
      `Cannot install Module Federation container "${name}" because that global already exists`
    )
  }
  if (moduleFederationRuntimeState.containers.has(name)) {
    throw new Error(
      `Cannot install Module Federation container "${name}" because it is already registered`
    )
  }

  // A remote's providers must not mutate a host scope before container.init.
  // Generated remote entries register into this private scope and init merges
  // it into the scope supplied by either a Webpack or Turbopack host.
  const localShareScope = options?.localShareScope || createShareScope()
  if (!isShareScope(localShareScope)) {
    throw new Error(
      `Container "${name}" cannot use an invalid local share scope`
    )
  }
  let initializedScope: ShareScope | undefined

  const container: Container = {
    async get(request, getScope) {
      const loader = hasOwn(moduleMap, request) ? moduleMap[request] : undefined
      if (!loader) {
        throw new Error(
          `Module "${request}" does not exist in container "${name}". Available modules: ${Object.keys(moduleMap).join(', ')}`
        )
      }

      const previousScope = setCurrentRemoteGetScope(getScope)
      let factoryPromise: Promise<ExposedModuleFactory>
      try {
        // Match Webpack by setting the current get scope only while invoking
        // the module-map loader. The loader owns the returned async work.
        factoryPromise = loader()
      } finally {
        setCurrentRemoteGetScope(previousScope)
      }

      const factory = await factoryPromise
      // Generated loaders already return a factory. Wrapping a plain namespace also makes the
      // public container robust for hand-written loaders.
      return typeof factory === 'function' ? factory : () => factory
    },

    init(shareScope, initScope) {
      if (!isShareScope(shareScope)) {
        throw new Error(
          `Container "${name}" cannot initialize with an invalid share scope`
        )
      }
      if (initializedScope && initializedScope !== shareScope) {
        throw new Error(
          `Container "${name}" has already been initialized with a different share scope`
        )
      }
      if (!initializedScope) {
        setShareScope(shareScopeName, shareScope)
        if (localShareScope !== shareScope) {
          mergeShareScopes(shareScope, localShareScope)
        }
        initializedScope = shareScope
      }
      return initializeSharing(shareScopeName, initScope)
    },
  }

  // `libraryType: "var"` containers are discovered through an own browser global. Refusing to
  // replace an existing value above protects application and platform globals from being clobbered.
  Object.defineProperty(globalObject, name, {
    configurable: true,
    enumerable: true,
    value: container,
    writable: true,
  })
  moduleFederationRuntimeState.containers.set(name, container)
  return container
}

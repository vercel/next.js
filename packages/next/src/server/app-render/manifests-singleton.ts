import type { ActionManifest } from '../../build/webpack/plugins/flight-client-entry-plugin'
import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import { InvariantError } from '../../shared/lib/invariant-error'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { pathHasPrefix } from '../../shared/lib/router/utils/path-has-prefix'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'
import { mightBeServerReferenceId } from '../../shared/lib/server-reference-info'
import { wellKnownProperties } from '../../shared/lib/utils/reflect-utils'
import { workAsyncStorage } from './work-async-storage.external'
import {
  workUnitAsyncStorage,
  type WorkUnitStore,
} from './work-unit-async-storage.external'

export interface ServerModuleMap {
  readonly [name: string]: {
    readonly id: string | number
    readonly name: string
    readonly chunks: Readonly<Array<string>> // currently not used
    readonly async?: boolean
  }
}

export function getActionNotFoundError(actionId: string | null): Error {
  return new Error(
    `Failed to find Server Action${actionId ? ` "${actionId}"` : ''}. This request might be from an older or newer deployment.\nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action`
  )
}

export function getInvalidServerReferenceIdError(id: string): Error {
  // `id` is arbitrary client-provided input. Unlike the not-found case, it has
  // not passed the length gate and can reach this error via a malformed server
  // reference in an action payload, so it may be of any length and contain
  // control characters. `JSON.stringify` escapes newlines and quotes so it
  // can't forge log lines, and truncating overly long ids prevents log
  // flooding. Ids at or below the cap are logged in full so that we only add an
  // ellipsis to ids that are meaningfully longer than the truncated length.
  const encoded = JSON.stringify(
    id.length > MAX_LOGGED_SERVER_REFERENCE_ID_LENGTH
      ? id.slice(0, TRUNCATED_SERVER_REFERENCE_ID_LENGTH) + '…'
      : id
  )

  return new Error(
    `The Server Reference ID did not match the expected format. Received ${encoded}.\nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action`
  )
}

// Ids at or below the cap are logged in full. Longer ids are truncated to the
// shorter length and marked with an ellipsis, so the cap leaves headroom over
// the truncated length rather than ellipsizing ids that are barely too long.
const MAX_LOGGED_SERVER_REFERENCE_ID_LENGTH = 100
const TRUNCATED_SERVER_REFERENCE_ID_LENGTH = 90

// This is a global singleton that is, among other things, also used to
// encode/decode bound args of server function closures. This can't be using a
// AsyncLocalStorage as it might happen at the module level.
const MANIFESTS_SINGLETON = Symbol.for('next.server.manifests')

interface RegisteredClientReferenceManifest {
  /**
   * The page the manifest was registered with. Routes are normalized app paths,
   * which is lossy (route groups, parallel slots and the trailing `/page` are
   * stripped), so this is kept alongside for consumers that need to address the
   * manifest on disk again rather than reversing the normalization.
   */
  readonly page: string
  readonly clientReferenceManifest: DeepReadonly<ClientReferenceManifest>
}

interface ManifestsSingleton {
  readonly clientReferenceManifestsPerRoute: Map<
    string,
    RegisteredClientReferenceManifest
  >
  readonly proxiedClientReferenceManifest: DeepReadonly<ClientReferenceManifest>
  readonly rscModuleMappingForUseCache: DeepReadonly<
    ClientReferenceManifest['rscModuleMapping']
  >
  serverActionsManifest: DeepReadonly<ActionManifest>
  serverModuleMap: ServerModuleMap
}

type GlobalThisWithManifests = typeof globalThis & {
  [MANIFESTS_SINGLETON]?: ManifestsSingleton
}

type ClientReferenceManifestMappingProp =
  | 'clientModules'
  | 'rscModuleMapping'
  | 'edgeRscModuleMapping'
  | 'ssrModuleMapping'
  | 'edgeSSRModuleMapping'

const globalThisWithManifests = globalThis as GlobalThisWithManifests

function isUseCacheStore(workUnitStore: WorkUnitStore | undefined): boolean {
  if (!workUnitStore) {
    return false
  }

  switch (workUnitStore.type) {
    case 'cache':
    case 'private-cache':
      return true
    case 'request':
    case 'unstable-cache':
    case 'prerender':
    case 'prerender-client':
    case 'prerender-legacy':
    case 'prerender-runtime':
    case 'validation-client':
    case 'generate-static-params':
      return false
    default:
      return workUnitStore satisfies never
  }
}

function createProxiedClientReferenceManifest(
  clientReferenceManifestsPerRoute: Map<
    string,
    RegisteredClientReferenceManifest
  >
): Pick<
  ManifestsSingleton,
  'proxiedClientReferenceManifest' | 'rscModuleMappingForUseCache'
> {
  const createMappingProxy = (prop: ClientReferenceManifestMappingProp) => {
    return new Proxy(
      {},
      {
        get(_, id: string) {
          const workStore = workAsyncStorage.getStore()

          if (workStore) {
            const currentManifest = clientReferenceManifestsPerRoute.get(
              workStore.route
            )?.clientReferenceManifest

            if (currentManifest?.[prop][id]) {
              if (
                workStore.durableUseCacheEntries &&
                prop === 'clientModules'
              ) {
                const workUnitStore = workUnitAsyncStorage.getStore()
                if (isUseCacheStore(workUnitStore)) {
                  // This creates a mapping so that a given client references with name
                  // `app/foo/client.tsx` is serialized as
                  // ```
                  // { id: `app/foo/client.tsx`, name: `*`, chunks: ["stub"], async: false }
                  // ```
                  // instead of the actual
                  // ```
                  // { id: 19132, name: `*`, chunks: ["/_next/static/chunks/..."], async: true }
                  // ```
                  //
                  // This means that not the unstable client module id is used for the cache entry,
                  // but the stable client reference name. The stable client reference name is
                  // resolved against the current manifest via rscModuleMappingForUseCache when the
                  // entry is read.
                  const clientReferenceManifestEntry =
                    currentManifest.clientModules[id]
                  return {
                    // Return `id` instead of `clientReferenceManifestEntry.id` here.
                    id,
                    name: clientReferenceManifestEntry.name,
                    // Set a sentinel value just in case this does ends up being read at some point
                    // in the future, then at least we'll get "Failed to load chunk stub (404)"
                    // instead of "Failed to load module 1234".
                    chunks: ['stub'],
                    async: false,
                  }
                }
              }
              return currentManifest[prop][id]
            }

            // In development, we also check all other manifests to see if the
            // module exists there. This is to support a scenario where React's
            // I/O tracking (dev-only) creates a connection from one page to
            // another through an emitted async I/O node that references client
            // components from the other page, e.g. in owner props.
            // TODO: Maybe we need to add a `debugBundlerConfig` option to React
            // to avoid this workaround. The current workaround has the
            // disadvantage that one might accidentally or intentionally share
            // client references across pages (e.g. by storing them in a global
            // variable), which would then only be caught in production.
            if (process.env.NODE_ENV !== 'production') {
              for (const [
                route,
                { page, clientReferenceManifest },
              ] of clientReferenceManifestsPerRoute) {
                if (route === workStore.route) {
                  continue
                }

                const entry = clientReferenceManifest[prop][id]

                if (entry !== undefined) {
                  if (process.env.__NEXT_DEV_SERVER) {
                    // The dev validation worker rebuilds this registry in its
                    // own thread, seeded with only the route it validates, so
                    // it has to be told which other manifests it needs.
                    workStore.additionalClientReferenceManifestPages ??=
                      new Set()
                    workStore.additionalClientReferenceManifestPages.add(page)
                  }

                  return entry
                }
              }
            }
          } else {
            // If there's no work store defined, we can assume that a client
            // reference manifest is needed during module evaluation, e.g. to
            // create a server function using a higher-order function. This
            // might also use client components which need to be serialized by
            // Flight, and therefore client references need to be resolvable. In
            // that case we search all page manifests to find the module.
            for (const {
              clientReferenceManifest,
            } of clientReferenceManifestsPerRoute.values()) {
              const entry = clientReferenceManifest[prop][id]

              if (entry !== undefined) {
                return entry
              }
            }
          }

          return undefined
        },
      }
    )
  }

  const mappingProxies = new Map<
    ClientReferenceManifestMappingProp,
    ReturnType<typeof createMappingProxy>
  >()

  const proxiedClientReferenceManifest = new Proxy(
    {},
    {
      get(_, prop) {
        const workStore = workAsyncStorage.getStore()

        switch (prop) {
          case 'moduleLoading':
          case 'entryCSSFiles':
          case 'entryJSFiles': {
            if (!workStore) {
              throw new InvariantError(
                `Cannot access "${prop}" without a work store.`
              )
            }

            const registeredManifest = clientReferenceManifestsPerRoute.get(
              workStore.route
            )

            if (!registeredManifest) {
              throw new InvariantError(
                `The client reference manifest for route "${workStore.route}" does not exist.`
              )
            }

            return registeredManifest.clientReferenceManifest[prop]
          }
          case 'clientModules':
          case 'rscModuleMapping':
          case 'edgeRscModuleMapping':
          case 'ssrModuleMapping':
          case 'edgeSSRModuleMapping': {
            let proxy = mappingProxies.get(prop)

            if (!proxy) {
              proxy = createMappingProxy(prop)
              mappingProxies.set(prop, proxy)
            }

            return proxy
          }
          default: {
            throw new InvariantError(
              `This is a proxied client reference manifest. The property "${String(prop)}" is not handled.`
            )
          }
        }
      },
    }
  ) as DeepReadonly<ClientReferenceManifest>

  // Performs the inverse of the clientModules isUseCacheStore(workUnitStore) special case above:
  //
  // For cache functions, don't do the usual rscModuleMapping lookup by module ID, but instead look
  // up by the stable client reference name. This is because cache entries must not depend on
  // build-local module IDs or chunks. So we need a second layer of indirection here to do client
  // reference name -> client module id -> rsc module mapping lookup.
  //
  // This one is created separately (not inside proxiedClientReferenceManifest.rscModuleMapping) as
  // we don't necessarily are inside a workUnitStore when we need to access this mapping (as opposed
  // to the clientModules mapping, which always has the ALS set).
  const rscModuleMappingForUseCache = new Proxy(
    {},
    {
      get(
        _,
        key: string
      ): ClientReferenceManifest['rscModuleMapping'][string] | undefined {
        const workStore = workAsyncStorage.getStore()
        if (workStore && workStore.durableUseCacheEntries) {
          const currentManifest = clientReferenceManifestsPerRoute.get(
            workStore.route
          )?.clientReferenceManifest

          const clientReferenceName = key
          const clientReferenceManifestEntry =
            currentManifest?.clientModules[clientReferenceName]
          if (clientReferenceManifestEntry === undefined) {
            return undefined
          }

          const clientModuleId = clientReferenceManifestEntry.id
          return currentManifest?.rscModuleMapping[clientModuleId]
        } else {
          return proxiedClientReferenceManifest.rscModuleMapping[key]
        }
      },
    }
  ) as DeepReadonly<ClientReferenceManifest['rscModuleMapping']>

  return { proxiedClientReferenceManifest, rscModuleMappingForUseCache }
}

/**
 * This function creates a Flight-acceptable server module map proxy from our
 * Server Reference Manifest similar to our client module map. This is because
 * our manifest contains a lot of internal Next.js data that are relevant to the
 * runtime, workers, etc. that React doesn't need to know.
 */
function createServerModuleMap(): ServerModuleMap {
  return new Proxy(Object.create(null) as ServerModuleMap, {
    get: (target, id: string | symbol, receiver) => {
      // React's debug serialization can probe the module map like a plain object.
      // These probes are not server reference lookups.
      if (typeof id !== 'string') {
        return Reflect.get(target, id, receiver)
      }

      if (wellKnownProperties.has(id)) {
        return Reflect.get(target, id, receiver)
      }

      if (!mightBeServerReferenceId(id)) {
        throw getInvalidServerReferenceIdError(id)
      }

      const workers =
        getServerActionsManifest()[
          process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'node'
        ]?.[id]?.workers

      if (!workers) {
        throw getActionNotFoundError(id)
      }

      const workStore = workAsyncStorage.getStore()

      let workerEntry:
        | {
            moduleId: string | number
            async: boolean
            durability?: {
              codeHash: string
              runtimeEnvVars: readonly string[]
            }
          }
        | undefined

      if (workStore) {
        workerEntry = workers[normalizeWorkerPageName(workStore.page)]
      } else {
        // If there's no work store defined, we can assume that a server
        // module map is needed during module evaluation, e.g. to create a
        // server action using a higher-order function. Therefore it should be
        // safe to return any entry from the manifest that matches the action
        // ID. They all refer to the same module ID, which must also exist in
        // the current page bundle. TODO: This is currently not guaranteed in
        // Turbopack, and needs to be fixed.
        workerEntry = Object.values(workers).at(0)
      }

      if (!workerEntry) {
        throw getActionNotFoundError(id)
      }

      const { moduleId, async, durability } = workerEntry

      return {
        id: moduleId,
        name: id,
        chunks: [],
        async,
        durability,
      }
    },
  })
}

/**
 * The flight entry loader keys actions by bundlePath. bundlePath corresponds
 * with the relative path (including 'app') to the page entrypoint.
 */
export function normalizeWorkerPageName(pageName: string) {
  if (pathHasPrefix(pageName, 'app')) {
    return pageName
  }

  return 'app' + pageName
}

/**
 * Converts a bundlePath (relative path to the entrypoint) to a routable page
 * name.
 */
function denormalizeWorkerPageName(bundlePath: string) {
  return normalizeAppPath(removePathPrefix(bundlePath, 'app'))
}

/**
 * Checks if the requested action has a worker for the current page.
 * If not, it returns the first worker that has a handler for the action.
 */
export function selectWorkerForForwarding(
  actionId: string,
  pageName: string
): string | undefined {
  const serverActionsManifest = getServerActionsManifest()
  const workers =
    serverActionsManifest[
      process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'node'
    ][actionId]?.workers

  // There are no workers to handle this action, nothing to forward to.
  if (!workers) {
    return
  }

  // If there is an entry for the current page, we don't need to forward.
  if (workers[normalizeWorkerPageName(pageName)]) {
    return
  }

  // Otherwise, grab the first worker that has a handler for this action id.
  return denormalizeWorkerPageName(Object.keys(workers)[0])
}

export function setManifestsSingleton({
  page,
  clientReferenceManifest,
  serverActionsManifest: rawServerActionsManifest,
}: {
  page: string
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>
  serverActionsManifest: DeepReadonly<ActionManifest>
}) {
  const existingSingleton = globalThisWithManifests[MANIFESTS_SINGLETON]
  const route = normalizeAppPath(page)

  const serverActionsManifest: DeepReadonly<ActionManifest> = {
    encryptionKey: rawServerActionsManifest.encryptionKey,
    // Use null-prototypes for the action objects to prevent prototype pollution
    // from affecting action ID lookups.
    node: Object.assign(Object.create(null), rawServerActionsManifest.node),
    edge: Object.assign(Object.create(null), rawServerActionsManifest.edge),
  }

  if (existingSingleton) {
    existingSingleton.clientReferenceManifestsPerRoute.set(route, {
      page,
      clientReferenceManifest,
    })

    existingSingleton.serverActionsManifest = serverActionsManifest
  } else {
    const clientReferenceManifestsPerRoute = new Map<
      string,
      RegisteredClientReferenceManifest
    >([[route, { page, clientReferenceManifest }]])

    const { proxiedClientReferenceManifest, rscModuleMappingForUseCache } =
      createProxiedClientReferenceManifest(clientReferenceManifestsPerRoute)

    globalThisWithManifests[MANIFESTS_SINGLETON] = {
      clientReferenceManifestsPerRoute,
      proxiedClientReferenceManifest,
      rscModuleMappingForUseCache,
      serverActionsManifest,
      serverModuleMap: createServerModuleMap(),
    }
  }
}

function getManifestsSingleton(): ManifestsSingleton {
  const manifestSingleton = globalThisWithManifests[MANIFESTS_SINGLETON]

  if (!manifestSingleton) {
    throw new InvariantError('The manifests singleton was not initialized.')
  }

  return manifestSingleton
}

/**
 * Returns the usual client_reference_manifest.json.
 *
 * In dev, it also looks up references of other pages (due to overlapping processing on
 * navigations).
 *
 * Inside a use-cache workUnitStore, clientModules instead map to a stable dummy value (see comments
 * above).
 */
export function getClientReferenceManifest(): DeepReadonly<ClientReferenceManifest> {
  return getManifestsSingleton().proxiedClientReferenceManifest
}

/**
 * A mapping of client reference names to the RSC module id. (So a double lookup of clientModules ->
 * rscModuleMapping)
 */
export function getRscModuleMappingForUseCache(): DeepReadonly<
  ClientReferenceManifest['rscModuleMapping']
> {
  return getManifestsSingleton().rscModuleMappingForUseCache
}

export function getServerActionsManifest(): DeepReadonly<ActionManifest> {
  return getManifestsSingleton().serverActionsManifest
}

export function getServerModuleMap() {
  return getManifestsSingleton().serverModuleMap
}

import type { ActionManifest } from '../../build/webpack/plugins/flight-client-entry-plugin'
import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import { InvariantError } from '../../shared/lib/invariant-error'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { pathHasPrefix } from '../../shared/lib/router/utils/path-has-prefix'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'
import { workAsyncStorage } from './work-async-storage.external'

export interface ServerModuleMap {
  readonly [name: string]: {
    readonly id: string | number
    readonly name: string
    readonly chunks: Readonly<Array<string>> // currently not used
    readonly async?: boolean
  }
}

// This is a global singleton that is, among other things, also used to
// encode/decode bound args of server function closures. This can't be using a
// AsyncLocalStorage as it might happen at the module level.
const MANIFESTS_SINGLETON = Symbol.for('next.server.manifests')

interface ManifestsSingleton {
  readonly clientReferenceManifestsPerRoute: Map<
    string,
    DeepReadonly<ClientReferenceManifest>
  >
  readonly proxiedClientReferenceManifest: DeepReadonly<ClientReferenceManifest>
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

function createProxiedClientReferenceManifest(
  clientReferenceManifestsPerRoute: Map<
    string,
    DeepReadonly<ClientReferenceManifest>
  >
): DeepReadonly<ClientReferenceManifest> {
  const createMappingProxy = (prop: ClientReferenceManifestMappingProp) => {
    return new Proxy(
      {},
      {
        get(_, id: string) {
          const workStore = workAsyncStorage.getStore()

          if (workStore) {
            const currentManifest = clientReferenceManifestsPerRoute.get(
              workStore.route
            )

            if (currentManifest?.[prop][id]) {
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
                manifest,
              ] of clientReferenceManifestsPerRoute) {
                if (route === workStore.route) {
                  continue
                }

                const entry = manifest[prop][id]

                if (entry !== undefined) {
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
            for (const manifest of clientReferenceManifestsPerRoute.values()) {
              const entry = manifest[prop][id]

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

  return new Proxy(
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

            const currentManifest = clientReferenceManifestsPerRoute.get(
              workStore.route
            )

            if (!currentManifest) {
              throw new InvariantError(
                `The client reference manifest for route "${workStore.route}" does not exist.`
              )
            }

            return currentManifest[prop]
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
}

/**
 * This function creates a Flight-acceptable server module map proxy from our
 * Server Reference Manifest similar to our client module map. This is because
 * our manifest contains a lot of internal Next.js data that are relevant to the
 * runtime, workers, etc. that React doesn't need to know.
 */
function createServerModuleMap(): ServerModuleMap {
  return new Proxy(
    {},
    {
      get: (_, id: string) => {
        const workers =
          getServerActionsManifest()[
            process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'node'
          ]?.[id]?.workers

        if (!workers) {
          return undefined
        }

        const workStore = workAsyncStorage.getStore()

        let workerEntry:
          | { moduleId: string | number; async: boolean }
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
          return undefined
        }

        const { moduleId, async } = workerEntry

        return { id: moduleId, name: id, chunks: [], async }
      },
    }
  )
}

/**
 * The flight entry loader keys actions by bundlePath. bundlePath corresponds
 * with the relative path (including 'app') to the page entrypoint.
 */
function normalizeWorkerPageName(pageName: string) {
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
  serverActionsManifest,
}: {
  page: string
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>
  serverActionsManifest: DeepReadonly<ActionManifest>
}) {
  const existingSingleton = globalThisWithManifests[MANIFESTS_SINGLETON]

  if (existingSingleton) {
    existingSingleton.clientReferenceManifestsPerRoute.set(
      normalizeAppPath(page),
      clientReferenceManifest
    )

    existingSingleton.serverActionsManifest = serverActionsManifest
  } else {
    const clientReferenceManifestsPerRoute = new Map<
      string,
      DeepReadonly<ClientReferenceManifest>
    >([[normalizeAppPath(page), clientReferenceManifest]])

    const proxiedClientReferenceManifest = createProxiedClientReferenceManifest(
      clientReferenceManifestsPerRoute
    )

    globalThisWithManifests[MANIFESTS_SINGLETON] = {
      clientReferenceManifestsPerRoute,
      proxiedClientReferenceManifest,
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

export function getClientReferenceManifest(): DeepReadonly<ClientReferenceManifest> {
  return getManifestsSingleton().proxiedClientReferenceManifest
}

export function getServerActionsManifest(): DeepReadonly<ActionManifest> {
  return getManifestsSingleton().serverActionsManifest
}

export function getServerModuleMap() {
  return getManifestsSingleton().serverModuleMap
}

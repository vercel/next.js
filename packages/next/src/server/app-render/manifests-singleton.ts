import type { ActionManifest } from '../../build/webpack/plugins/flight-client-entry-plugin'
import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import { InvariantError } from '../../shared/lib/invariant-error'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { createServerModuleMap, type ServerModuleMap } from './action-utils'
import { workAsyncStorage } from './work-async-storage.external'

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

    existingSingleton.serverModuleMap = createServerModuleMap({
      serverActionsManifest,
    })
  } else {
    const clientReferenceManifestsPerRoute = new Map<
      string,
      DeepReadonly<ClientReferenceManifest>
    >([[normalizeAppPath(page), clientReferenceManifest]])

    const proxiedClientReferenceManifest = createProxiedClientReferenceManifest(
      clientReferenceManifestsPerRoute
    )

    const serverModuleMap = createServerModuleMap({
      serverActionsManifest,
    })

    globalThisWithManifests[MANIFESTS_SINGLETON] = {
      clientReferenceManifestsPerRoute,
      proxiedClientReferenceManifest,
      serverActionsManifest,
      serverModuleMap,
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

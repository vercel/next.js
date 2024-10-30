import type { ActionManifest } from '../../build/webpack/plugins/flight-client-entry-plugin'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { pathHasPrefix } from '../../shared/lib/router/utils/path-has-prefix'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'
import { workAsyncStorage } from './work-async-storage.external'

// This function creates a Flight-acceptable server module map proxy from our
// Server Reference Manifest similar to our client module map.
// This is because our manifest contains a lot of internal Next.js data that
// are relevant to the runtime, workers, etc. that React doesn't need to know.
export function createServerModuleMap({
  serverActionsManifest,
}: {
  serverActionsManifest: ActionManifest
}) {
  return new Proxy(
    {},
    {
      get: (_, id: string) => {
        const workers =
          serverActionsManifest[
            process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'node'
          ][id].workers

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
 * Checks if the requested action has a worker for the current page.
 * If not, it returns the first worker that has a handler for the action.
 */
export function selectWorkerForForwarding(
  actionId: string,
  pageName: string,
  serverActionsManifest: ActionManifest
) {
  const workers =
    serverActionsManifest[
      process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'node'
    ][actionId]?.workers
  const workerName = normalizeWorkerPageName(pageName)

  // no workers, nothing to forward to
  if (!workers) return

  // if there is a worker for this page, no need to forward it.
  if (workers[workerName]) {
    return
  }

  // otherwise, grab the first worker that has a handler for this action id
  return denormalizeWorkerPageName(Object.keys(workers)[0])
}

/**
 * The flight entry loader keys actions by bundlePath.
 * bundlePath corresponds with the relative path (including 'app') to the page entrypoint.
 */
function normalizeWorkerPageName(pageName: string) {
  if (pathHasPrefix(pageName, 'app')) {
    return pageName
  }

  return 'app' + pageName
}

/**
 * Converts a bundlePath (relative path to the entrypoint) to a routable page name
 */
function denormalizeWorkerPageName(bundlePath: string) {
  return normalizeAppPath(removePathPrefix(bundlePath, 'app'))
}

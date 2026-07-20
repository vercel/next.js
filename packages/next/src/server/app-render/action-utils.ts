import type { ActionManifest } from '../../build/webpack/plugins/flight-client-entry-plugin'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { pathHasPrefix } from '../../shared/lib/router/utils/path-has-prefix'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'
import { mightBeServerReferenceId } from '../../shared/lib/server-reference-info'
import { wellKnownProperties } from '../../shared/lib/utils/reflect-utils'
import { workAsyncStorage } from './work-async-storage.external'

export interface ServerModuleMap {
  readonly [name: string]: {
    readonly id: string | number
    readonly name: string
    readonly chunks: Readonly<Array<string>>
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

// This function creates a Flight-acceptable server module map proxy from our
// Server Reference Manifest similar to our client module map.
// This is because our manifest contains a lot of internal Next.js data that
// are relevant to the runtime, workers, etc. that React doesn't need to know.
export function createServerModuleMap({
  serverActionsManifest,
}: {
  serverActionsManifest: ActionManifest
}): ServerModuleMap {
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
        serverActionsManifest[
          process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'node'
        ]?.[id]?.workers

      if (!workers) {
        throw getActionNotFoundError(id)
      }

      const workStore = workAsyncStorage.getStore()

      let workerEntry: { moduleId: string | number; async: boolean } | undefined

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

      const { moduleId, async } = workerEntry

      return { id: moduleId, name: id, chunks: [], async }
    },
  })
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

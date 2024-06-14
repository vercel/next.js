import type { ActionManifest } from '../../build/webpack/plugins/flight-client-entry-plugin'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { pathHasPrefix } from '../../shared/lib/router/utils/path-has-prefix'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'

// This function creates a Flight-acceptable server module map proxy from our
// Server Reference Manifest similar to our client module map.
// This is because our manifest contains a lot of internal Next.js data that
// are relevant to the runtime, workers, etc. that React doesn't need to know.
export function createServerModuleMap({
  serverActionsManifest,
  pageName,
}: {
  serverActionsManifest: ActionManifest
  pageName: string
}) {
  return new Proxy(
    {},
    {
      get: (_, id: string) => {
        return {
          id: serverActionsManifest[
            process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'node'
          ][id].workers[normalizeWorkerPageName(pageName)],
          name: id,
          chunks: [],
        }
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

type ReactThenable = Promise<any> & {
  status?: 'fulfilled' | 'rejected'
  value?: any
  reason?: any
}

export function createFormActionEncoder(
  encodeReply: (reference: any) => ReactThenable
) {
  let identifierPrefixCounter = 0

  // From ReactFlightClient.js in React:
  // https://github.com/facebook/react/blob/3154ec8a38e6014090039be54e0ca597fa967fdd/packages/react-client/src/ReactFlightReplyClient.js#L872
  function encodeFormData(reference: any) {
    let resolve: any, reject: any

    // We need to have a handle on the thenable so that we can synchronously set
    // its status from processReply, when it can complete synchronously.
    const thenable: ReactThenable = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })

    encodeReply(reference)
      .then((body: string | FormData) => {
        if (typeof body === 'string') {
          const data = new FormData()
          data.append('0', body)
          body = data
        }
        const fulfilled = thenable
        fulfilled.status = 'fulfilled'
        fulfilled.value = body

        resolve(body)
      })
      .catch((e: any) => {
        const rejected = thenable
        rejected.status = 'rejected'
        rejected.reason = e

        reject(e)
      })

    return thenable
  }

  // TODO: Make this a WeakMap however we don't have access to the reference.
  const thenableCache = new Map()

  // Modified from ReactFlightReplyClient.js in React:
  // https://github.com/facebook/react/blob/fb9a90fa480efce40ac2a845478817467f965ddc/packages/react-client/src/ReactFlightReplyClient.js#L905C1-L952C2
  return function encodeFormAction(id: any, boundPromise: Promise<any>) {
    let data: null | FormData = null
    let name

    let thenable = thenableCache.get(id)
    if (!thenable) {
      thenable = encodeFormData({
        id,
        bound: boundPromise,
      })
      thenableCache.set(id, thenable)
    }

    if (thenable.status === 'rejected') {
      throw thenable.reason
    } else if (thenable.status !== 'fulfilled') {
      throw thenable
    }
    const encodedFormData = thenable.value

    // all fields but the suspense cache would break since we might get
    // a new identifier each time. So we just append it at the end instead.
    const prefixedData = new FormData()

    const identifierPrefix = identifierPrefixCounter++
    encodedFormData.forEach((value: string | File, key: string) => {
      prefixedData.append('$ACTION_' + identifierPrefix + ':' + key, value)
    })
    data = prefixedData
    // We encode the name of the prefix containing the data.
    name = '$ACTION_REF_' + identifierPrefix

    return {
      name,
      method: 'POST',
      encType: 'multipart/form-data',
      data,

      // Use a special URL query as the form `action` attribute, instead of
      // falling back to the default behavior of using the current page URL.
      // It will still POST to the same place, but we now have a way to
      // identify the form submission as Server Action request (with a
      // specific ID) in the progressive enhancement scenario.
      action: '?__next_action__=' + id,
    }
  }
}

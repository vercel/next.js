import type { FlightRouterState } from '../../../../shared/lib/app-router-types'
import {
  type FetchServerActionResult,
  fetchServerAction,
  dispatchNavigationOnServerActionResponse,
  dispatchNoOpOnServerActionResponse,
} from './server-action-reducer'

export type ServerActionTask = {
  url: URL
  baseTree: FlightRouterState
  nextUrl: string | null
  needsRefresh: boolean
  actionId: string
  actionArgs: any[]
  resolve: (value: any) => void
  reject: (reason?: any) => void
  next: ServerActionTask | null
}

/**
 * The most recently scheduled Server Action task.
 */
let lastTask: ServerActionTask | null = null

export function scheduleServerAction(
  urlOfPageToInvokeActionOn: URL,
  baseTree: FlightRouterState,
  nextUrl: string | null,
  needsRefresh: boolean,
  actionId: string,
  actionArgs: any[],
  resolve: (value: any) => void,
  reject: (reason?: any) => void
): void {
  // Send the Server Action request to the server. Or, if one's already in-
  // progress, append a new task to the end of the queue. Server Actions
  // run sequentially.
  // TODO: Add support for concurrent Server Action invocations. This will be
  // behind a flag at first since it's a subtle breaking change. We'll also add
  // other scheduling improvements like batching. That's why this module is
  // structured the way it is.
  const task: ServerActionTask = {
    url: urlOfPageToInvokeActionOn,
    baseTree,
    nextUrl,
    needsRefresh,
    actionId,
    actionArgs,
    resolve,
    reject,
    next: null,
  }
  if (lastTask === null) {
    startServerActionTask(task)
  } else {
    lastTask.next = task
  }
}

function startServerActionTask(task: ServerActionTask) {
  const baseTree = task.baseTree
  const resolve = task.resolve
  const reject = task.reject
  fetchServerAction(task)
    .then(
      (result: FetchServerActionResult) => {
        dispatchNavigationOnServerActionResponse(
          baseTree,
          resolve,
          reject,
          result
        )
        finishServerActionTask(task)
      },
      (e: unknown) => {
        reject(e)
        dispatchNoOpOnServerActionResponse()
        finishServerActionTask(task)
      }
    )
    .then(() => {})
}

function finishServerActionTask(task: ServerActionTask) {
  // Start the next task in the queue.
  const next = task.next
  if (next !== null) {
    startServerActionTask(next)
  } else {
    lastTask = null
  }
}

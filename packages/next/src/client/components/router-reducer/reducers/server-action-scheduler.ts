import {
  fetchServerAction,
  handleServerActionResult,
  type FetchServerActionResult,
} from './server-action-reducer'
import {
  accumulateTaskFreshness,
  getCurrentAppRouterState,
  getNextURLForServerAction,
  markTaskAsReady,
  pingRouterQueue,
  requestServerActionRevalidation,
  type ServerActionRouterTask,
} from './router-task'
import { FreshnessPolicy } from '../ppr-navigations'
import type { NavigationSeed } from '../../segment-cache/navigation'

export type ServerActionCall<T> = {
  actionId: string
  actionArgs: any[]

  needsRevalidate: boolean

  fulfill: (value: T) => void
  reject: (error: unknown) => void
}

let lastAction: ServerActionRouterTask | null = null
let firstAction: ServerActionRouterTask | null = null
let isActionIsInProgress = false

export function scheduleServerActionRequest(
  task: ServerActionRouterTask
): void {
  if (lastAction === null) {
    lastAction = firstAction = task
  } else {
    lastAction.nextAction = task
    lastAction = task
  }
  pingServerActionQueue()
}

function pingServerActionQueue() {
  // Only work on the next action in the queue if there is no other action
  // in progress.
  // TODO: Allow multiple Server Actions to run in parallel, except when invoked
  // by the same useActionState. This will be gated behind an opt-in flag at
  // first, since in some scenarios it could be considered a breaking change.
  if (isActionIsInProgress || firstAction === null) {
    return
  }

  // Remove the first action from the queue.
  const action = firstAction
  firstAction = action.nextAction
  if (firstAction === null) {
    lastAction = null
  }
  action.nextAction = null

  // Call the action.
  startServerActionCall(action)
}

function startServerActionCall(task: ServerActionRouterTask) {
  const baseState = getCurrentAppRouterState()
  if (baseState === null) {
    return
  }
  const call = task.data
  const actionId = call.actionId
  const actionArgs = call.actionArgs

  const urlOfPageToInvokeActionOn = task.url
  const nextUrl = getNextURLForServerAction(baseState)
  const baseTree = baseState.tree

  isActionIsInProgress = true
  fetchServerAction(
    urlOfPageToInvokeActionOn,
    nextUrl,
    baseTree,
    actionId,
    actionArgs
  ).then(
    (result: FetchServerActionResult) => {
      isActionIsInProgress = false
      handleServerActionResult(
        task,
        urlOfPageToInvokeActionOn,
        baseTree,
        result
      )
      pingRouterQueue()
      pingServerActionQueue()
    },
    (error: unknown) => {
      isActionIsInProgress = false
      markServerActionTaskAsReady(
        task,
        urlOfPageToInvokeActionOn,
        null,
        'reload',
        FreshnessPolicy.Restore
      )
      call.reject(error)
      pingRouterQueue()
      pingServerActionQueue()
    }
  )
}

export function markServerActionTaskAsReady(
  task: ServerActionRouterTask,
  url: URL,
  seed: NavigationSeed | null,
  navigateType: NavigationType,
  freshness: FreshnessPolicy
) {
  const call = task.data
  if (call.needsRevalidate && freshness > FreshnessPolicy.Default) {
    // This Server Action performed a revalidation/refresh, so we must re-render
    // the UI with the updated data. However, a more recent navigation was
    // initiated, which supersedes this action. So we can't apply the data sent
    // by the server. Schedule an async revalidation.
    const shouldHardNavigate = false
    requestServerActionRevalidation(shouldHardNavigate)
    return
  }

  const finishedTask = markTaskAsReady(task, url, seed)
  finishedTask.navigationType = navigateType
  accumulateTaskFreshness(finishedTask, freshness)
}

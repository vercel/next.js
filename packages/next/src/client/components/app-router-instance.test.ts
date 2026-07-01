/**
 * @jest-environment node
 */
import {
  createMutableActionQueue,
  type AppRouterActionQueue,
} from './app-router-instance'
import {
  ACTION_NAVIGATE,
  ACTION_SERVER_ACTION,
  type AppRouterState,
  type ReducerActions,
} from './router-reducer/router-reducer-types'

// Deterministic unit coverage for the discarded-action queue behavior behind
// #86151 (regression from #82674). When an in-flight Server Action is discarded
// by a navigation, its reducer result eventually settles *while the navigation
// is still pending*. The queue must not run the rest of the pending action queue
// from that discarded, non-revalidating result — doing so dispatches a state
// update in the middle of the navigation transition and drops the destination
// segment. These tests reproduce that sequence directly on the action queue,
// with a controllable reducer, so the failure is deterministic and has no
// browser/timing/third-party dependencies.

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

// Drain the microtask queue so queued `.then` continuations (handleResult and
// any follow-on runAction) have executed before we assert.
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Builds a queue whose reducer never resolves on its own: each dispatched action
 * gets a deferred we can settle by hand, and every reducer invocation is
 * recorded. This lets a test sequence the exact interleaving of a discarded
 * Server Action settling against a still-pending navigation.
 */
function setupControllableQueue() {
  const reducerCalls: ReducerActions[] = []
  const deferredByPayload = new Map<ReducerActions, Deferred<AppRouterState>>()

  const queue = createMutableActionQueue({} as AppRouterState)

  queue.action = ((_state: AppRouterState, payload: ReducerActions) => {
    reducerCalls.push(payload)
    const deferred = createDeferred<AppRouterState>()
    deferredByPayload.set(payload, deferred)
    return deferred.promise
  }) as unknown as AppRouterActionQueue['action']

  const settle = (payload: ReducerActions) => {
    const deferred = deferredByPayload.get(payload)
    if (!deferred) {
      throw new Error('reducer was never invoked for the given payload')
    }
    deferred.resolve({} as AppRouterState)
  }

  const ran = (payload: ReducerActions) => reducerCalls.includes(payload)

  return { queue, ran, settle }
}

describe('action queue: discarding an in-flight server action (#86151)', () => {
  it('does not run the remaining queue when a discarded, non-revalidating server action settles mid-navigation', async () => {
    const { queue, ran, settle } = setupControllableQueue()
    const setState = jest.fn()

    // A non-revalidating Server Action starts and stays in flight.
    const serverAction = {
      type: ACTION_SERVER_ACTION,
      didRevalidate: false,
    } as unknown as ReducerActions
    queue.dispatch(serverAction, setState)

    // A second action queues up behind it (e.g. another provider action). It
    // must not run until the queue explicitly advances to it.
    const queuedAction = {
      type: ACTION_SERVER_ACTION,
      didRevalidate: false,
    } as unknown as ReducerActions
    queue.dispatch(queuedAction, setState)

    // A navigation arrives: it discards the pending Server Action and becomes
    // the pending action, while inheriting the still-queued action as its next.
    const navigation = { type: ACTION_NAVIGATE } as unknown as ReducerActions
    queue.dispatch(navigation, setState)

    expect(ran(serverAction)).toBe(true)
    expect(ran(navigation)).toBe(true)
    expect(ran(queuedAction)).toBe(false)

    // The discarded Server Action's reducer settles — but the navigation it was
    // discarded for is still pending.
    settle(serverAction)
    await flush()

    // Regression assertion: the discarded, non-revalidating result must not
    // advance the queue or run the remaining action mid-navigation. Before the
    // fix this ran `queuedAction` (and moved `pending` off the navigation),
    // firing a state update that drops the destination segment.
    expect(ran(queuedAction)).toBe(false)
    expect(queue.pending?.payload).toBe(navigation)
  })

  it('still runs the remaining queue when the discarded server action revalidated (preserves #82674)', async () => {
    const { queue, ran, settle } = setupControllableQueue()
    const setState = jest.fn()

    // This time the discarded Server Action *did* revalidate, so its remaining
    // work should still run to trigger the refresh — the fix only skips the
    // non-revalidating case, it does not disable #82674's behavior.
    const serverAction = {
      type: ACTION_SERVER_ACTION,
      didRevalidate: true,
    } as unknown as ReducerActions
    queue.dispatch(serverAction, setState)

    const queuedAction = {
      type: ACTION_SERVER_ACTION,
      didRevalidate: false,
    } as unknown as ReducerActions
    queue.dispatch(queuedAction, setState)

    const navigation = { type: ACTION_NAVIGATE } as unknown as ReducerActions
    queue.dispatch(navigation, setState)

    expect(ran(queuedAction)).toBe(false)

    settle(serverAction)
    await flush()

    // Revalidating discard advances the queue and runs the remaining action.
    expect(ran(queuedAction)).toBe(true)
  })
})

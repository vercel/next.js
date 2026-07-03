/**
 * @jest-environment jsdom
 */
import type { FlightRouterState } from '../../shared/lib/app-router-types'
import {
  ACTION_NAVIGATE,
  ACTION_REFRESH,
  ACTION_SERVER_ACTION,
  type AppRouterState,
  type NavigateAction,
  type ReducerActions,
  type ServerActionAction,
} from './router-reducer/router-reducer-types'
import type { PendingRouterTransition } from './router-transition'

jest.mock('./app-router-instance', () => ({
  getCurrentAppRouterState: jest.fn(),
}))

// Each test re-requires the module for a fresh pendingTransitions buffer.
type RouterTransitionModule = typeof import('./router-transition')

function makeTree(): FlightRouterState {
  // A minimal tree: a root layout whose child is a page segment. A fresh
  // object per call, mirroring the router (tree identity is how commits are
  // matched back to transitions).
  return ['', { children: ['__PAGE__', {}] }]
}

function makeState(
  tree: FlightRouterState,
  canonicalUrl: string,
  mpaNavigation = false
) {
  // settleRouterTransition and commitRouterTransition only read these fields.
  return {
    tree,
    canonicalUrl,
    renderedSearch: '',
    pushRef: { mpaNavigation },
  } as AppRouterState
}

function navigatePayload(
  transition: PendingRouterTransition | null
): ReducerActions {
  // settleRouterTransition only reads `type` and `instrumentationTransition`
  // from navigate actions.
  return {
    type: ACTION_NAVIGATE,
    instrumentationTransition: transition,
  } as NavigateAction
}

function refreshPayload(): ReducerActions {
  return { type: ACTION_REFRESH }
}

function serverActionPayload(): ReducerActions {
  return { type: ACTION_SERVER_ACTION } as ServerActionAction
}

describe('router transition lifecycle bookkeeping', () => {
  let routerTransition: RouterTransitionModule
  let events: Array<{ phase: string; url: string; event: any }>
  // The state the queue held before the action under test ran, i.e. what its
  // reducer derived from.
  let currentState: AppRouterState

  // Runs an action's settle exactly like the action queue does, and advances
  // the simulated queue state on success.
  function settle(payload: ReducerActions, nextState: AppRouterState) {
    routerTransition.settleRouterTransition(payload, currentState, nextState)
    if (nextState !== currentState && !nextState.pushRef.mpaNavigation) {
      currentState = nextState
    }
  }

  beforeEach(() => {
    process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS = 'true'
    jest.resetModules()
    routerTransition =
      require('./router-transition') as typeof import('./router-transition')

    currentState = makeState(makeTree(), '/')
    const { getCurrentAppRouterState } =
      require('./app-router-instance') as typeof import('./app-router-instance')
    ;(getCurrentAppRouterState as jest.Mock).mockImplementation(
      () => currentState
    )

    events = []
    routerTransition.initializeRouterTransitionModules([
      {
        onRouterTransitionStart: (url: string, _type: string, event: any) => {
          events.push({ phase: 'start', url, event })
        },
        unstable_onRouterTransitionCommit: (
          url: string,
          _type: string,
          event: any
        ) => {
          events.push({ phase: 'commit', url, event })
        },
        unstable_onRouterTransitionAbort: (
          url: string,
          _type: string,
          event: any
        ) => {
          events.push({ phase: 'abort', url, event })
        },
      } as any,
    ])
  })

  afterEach(() => {
    delete process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS
  })

  it('commits a navigation whose settled state reaches HistoryUpdater', () => {
    const transition = routerTransition.startRouterTransition('/a', 'push')!
    const destination = makeState(makeTree(), '/a')
    settle(navigatePayload(transition), destination)
    routerTransition.commitRouterTransition(destination)

    const commits = events.filter((e) => e.phase === 'commit')
    expect(commits).toHaveLength(1)
    expect(commits[0].event.id).toBe(transition.id)
    expect(commits[0].url).toBe('/a')
    expect(events.filter((e) => e.phase === 'abort')).toHaveLength(0)
  })

  it('aborts a replaced transition when the navigation that replaced it commits', () => {
    const first = routerTransition.startRouterTransition('/a', 'push')!
    const second = routerTransition.startRouterTransition('/b', 'push')!

    // The action queue discards the first navigation's action when the
    // second is dispatched...
    routerTransition.markRouterTransitionAsReplaced(first)
    // ...and the second navigation settles with its destination state.
    const destination = makeState(makeTree(), '/b')
    settle(navigatePayload(second), destination)
    routerTransition.commitRouterTransition(destination)

    const commits = events.filter((e) => e.phase === 'commit')
    const aborts = events.filter((e) => e.phase === 'abort')
    expect(commits).toHaveLength(1)
    expect(commits[0].event.id).toBe(second.id)
    expect(aborts).toHaveLength(1)
    expect(aborts[0].event.id).toBe(first.id)
    expect(aborts[0].event.replacedBy).toBe(second.id)
  })

  it('untracks a navigation that settles with the unchanged current state (failed fetch)', () => {
    const transition = routerTransition.startRouterTransition('/a', 'push')!
    // navigateImpl's failure path resolves to the state object the reducer
    // started from — identity is the signal settleRouterTransition keys on.
    settle(navigatePayload(transition), currentState)

    // A later navigation's commit must not claim the failed transition.
    const second = routerTransition.startRouterTransition('/b', 'push')!
    const destination = makeState(makeTree(), '/b')
    settle(navigatePayload(second), destination)
    routerTransition.commitRouterTransition(destination)

    expect(events.filter((e) => e.phase === 'abort')).toHaveLength(0)
    const commits = events.filter((e) => e.phase === 'commit')
    expect(commits).toHaveLength(1)
    expect(commits[0].event.id).toBe(second.id)
  })

  it('untracks a navigation that settles with a full-page (MPA) state', () => {
    const transition = routerTransition.startRouterTransition('/other', 'push')!
    settle(navigatePayload(transition), makeState(makeTree(), '/other', true))

    const second = routerTransition.startRouterTransition('/b', 'push')!
    const destination = makeState(makeTree(), '/b')
    settle(navigatePayload(second), destination)
    routerTransition.commitRouterTransition(destination)

    expect(events.filter((e) => e.phase === 'abort')).toHaveLength(0)
    expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
  })

  it('drops a replaced transition when the navigation that replaced it fails, instead of letting a later unrelated commit claim it', () => {
    const first = routerTransition.startRouterTransition('/a', 'push')!
    const second = routerTransition.startRouterTransition('/b', 'push')!

    // The second navigation discards the first...
    routerTransition.markRouterTransitionAsReplaced(first)
    // ...but then itself fails without committing, so its settle untracks it.
    // With no live navigation left in the race, the replaced first transition
    // must be dropped too.
    settle(navigatePayload(second), currentState)

    // A later, unrelated navigation commits. It must not report the stale
    // first transition as one of its aborts.
    const third = routerTransition.startRouterTransition('/c', 'push')!
    const destination = makeState(makeTree(), '/c')
    settle(navigatePayload(third), destination)
    routerTransition.commitRouterTransition(destination)

    const commits = events.filter((e) => e.phase === 'commit')
    expect(commits).toHaveLength(1)
    expect(commits[0].event.id).toBe(third.id)
    expect(events.filter((e) => e.phase === 'abort')).toHaveLength(0)
    expect(events.filter((e) => e.phase === 'start')).toHaveLength(3)
  })

  it('keeps a replaced transition buffered while a live navigation in its race is still pending', () => {
    const first = routerTransition.startRouterTransition('/a', 'push')!
    const second = routerTransition.startRouterTransition('/b', 'push')!
    routerTransition.markRouterTransitionAsReplaced(first)

    // An unrelated non-navigation state reaches HistoryUpdater: no tracked
    // tree matches, so nothing may be emitted and the race must stay intact.
    routerTransition.commitRouterTransition(makeState(makeTree(), '/'))
    expect(events.filter((e) => e.phase === 'abort')).toHaveLength(0)

    // The live navigation then settles and commits, settling the race.
    const destination = makeState(makeTree(), '/b')
    settle(navigatePayload(second), destination)
    routerTransition.commitRouterTransition(destination)
    const aborts = events.filter((e) => e.phase === 'abort')
    expect(aborts).toHaveLength(1)
    expect(aborts[0].event.id).toBe(first.id)
    expect(aborts[0].event.replacedBy).toBe(second.id)
  })

  it('follows a refresh derived from a not-yet-committed navigation, so batching cannot starve the commit', () => {
    // router.push('/dest') and router.refresh() in the same tick: the refresh
    // derives a fresh tree from the navigation's uncommitted state, and React
    // batches so only the refresh's tree ever reaches HistoryUpdater.
    const transition = routerTransition.startRouterTransition('/dest', 'push')!
    const navState = makeState(makeTree(), '/dest')
    settle(navigatePayload(transition), navState)

    const refreshedState = makeState(makeTree(), '/dest')
    settle(refreshPayload(), refreshedState)

    // Only the refresh's state commits.
    routerTransition.commitRouterTransition(refreshedState)

    const commits = events.filter((e) => e.phase === 'commit')
    expect(commits).toHaveLength(1)
    expect(commits[0].event.id).toBe(transition.id)
    expect(events.filter((e) => e.phase === 'abort')).toHaveLength(0)
  })

  it('follows a same-URL server action revalidation, but not a server action redirect', () => {
    // Same URL (revalidation): the transition follows the derived tree.
    const first = routerTransition.startRouterTransition('/dest', 'push')!
    const firstNavState = makeState(makeTree(), '/dest')
    settle(navigatePayload(first), firstNavState)
    const revalidatedState = makeState(makeTree(), '/dest')
    settle(serverActionPayload(), revalidatedState)
    routerTransition.commitRouterTransition(revalidatedState)
    expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
    expect(events.filter((e) => e.phase === 'commit')[0].event.id).toBe(
      first.id
    )

    // Different URL (redirect): the pending transition must NOT follow — the
    // redirect's destination is not what the navigation targeted.
    const second = routerTransition.startRouterTransition('/dest2', 'push')!
    const secondNavState = makeState(makeTree(), '/dest2')
    settle(navigatePayload(second), secondNavState)
    const redirectedState = makeState(makeTree(), '/somewhere-else')
    settle(serverActionPayload(), redirectedState)
    routerTransition.commitRouterTransition(redirectedState)

    // The redirect's commit is not attributed to the pending navigation...
    expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
    // ...which can still commit if its own state renders individually.
    routerTransition.commitRouterTransition(secondNavState)
    const commits = events.filter((e) => e.phase === 'commit')
    expect(commits).toHaveLength(2)
    expect(commits[1].event.id).toBe(second.id)
  })

  it('drops replaced transitions that outlive a commit once no live navigation remains', () => {
    // An older navigation commits while a newer, already-replaced transition
    // (whose replacer previously failed) is still buffered: the newer entry
    // survives the commit's backward sweep, but with no live navigation left
    // it must be dropped rather than linger.
    const first = routerTransition.startRouterTransition('/a', 'push')!
    const firstState = makeState(makeTree(), '/a')
    settle(navigatePayload(first), firstState)

    const second = routerTransition.startRouterTransition('/b', 'push')!
    routerTransition.markRouterTransitionAsReplaced(second)
    const third = routerTransition.startRouterTransition('/c', 'push')!
    routerTransition.untrackRouterTransition(third)

    // React commits the first navigation's state (it settled before the
    // others and its commit was already scheduled).
    routerTransition.commitRouterTransition(firstState)
    expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)

    // A later unrelated navigation must start with a clean slate.
    const fourth = routerTransition.startRouterTransition('/d', 'push')!
    const destination = makeState(makeTree(), '/d')
    settle(navigatePayload(fourth), destination)
    routerTransition.commitRouterTransition(destination)

    expect(events.filter((e) => e.phase === 'abort')).toHaveLength(0)
    expect(events.filter((e) => e.phase === 'commit')).toHaveLength(2)
  })
})

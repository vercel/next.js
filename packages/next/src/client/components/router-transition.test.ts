/**
 * @jest-environment jsdom
 */
import type { FlightRouterState } from '../../shared/lib/app-router-types'
import type { AppRouterState } from './router-reducer/router-reducer-types'

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

function makeState(tree: FlightRouterState, canonicalUrl: string) {
  // commitRouterTransition and the `from` description only read these fields.
  return { tree, canonicalUrl, renderedSearch: '' } as AppRouterState
}

describe('router transition lifecycle bookkeeping', () => {
  let routerTransition: RouterTransitionModule
  let events: Array<{ phase: string; url: string; event: any }>

  beforeEach(() => {
    process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS = 'true'
    jest.resetModules()
    routerTransition =
      require('./router-transition') as typeof import('./router-transition')

    const { getCurrentAppRouterState } =
      require('./app-router-instance') as typeof import('./app-router-instance')
    getCurrentAppRouterState.mockReturnValue(makeState(makeTree(), '/'))

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

  it('aborts a replaced transition when the navigation that replaced it commits', () => {
    const first = routerTransition.startRouterTransition('/a', 'push')!
    const second = routerTransition.startRouterTransition('/b', 'push')!

    // The action queue discards the first navigation's action when the
    // second is dispatched...
    routerTransition.markRouterTransitionAsReplaced(first)
    // ...and the second navigation produces its destination state.
    const secondTree = makeTree()
    routerTransition.attachRouterTransitionTarget(second, secondTree)
    routerTransition.commitRouterTransition(makeState(secondTree, '/b'))

    const commits = events.filter((e) => e.phase === 'commit')
    const aborts = events.filter((e) => e.phase === 'abort')
    expect(commits).toHaveLength(1)
    expect(commits[0].event.id).toBe(second.id)
    expect(aborts).toHaveLength(1)
    expect(aborts[0].event.id).toBe(first.id)
    expect(aborts[0].event.replacedBy).toBe(second.id)
  })

  it('drops a replaced transition when the navigation that replaced it fails, instead of letting a later unrelated commit claim it', () => {
    const first = routerTransition.startRouterTransition('/a', 'push')!
    const second = routerTransition.startRouterTransition('/b', 'push')!

    // The second navigation discards the first...
    routerTransition.markRouterTransitionAsReplaced(first)
    // ...but then itself fails without committing (e.g. its dynamic fetch
    // rejected), so the action queue untracks it. With no live navigation
    // left in the race, the replaced first transition must be dropped too.
    routerTransition.untrackRouterTransition(second)

    // A later, unrelated navigation commits. It must not report the stale
    // first transition as one of its aborts — before the sweep, this
    // emitted an abort for `first` with replacedBy pointing at a commit
    // that never raced it.
    const third = routerTransition.startRouterTransition('/c', 'push')!
    const thirdTree = makeTree()
    routerTransition.attachRouterTransitionTarget(third, thirdTree)
    routerTransition.commitRouterTransition(makeState(thirdTree, '/c'))

    const commits = events.filter((e) => e.phase === 'commit')
    const aborts = events.filter((e) => e.phase === 'abort')
    expect(commits).toHaveLength(1)
    expect(commits[0].event.id).toBe(third.id)
    expect(aborts).toHaveLength(0)
    expect(events.filter((e) => e.phase === 'start')).toHaveLength(3)
  })

  it('keeps a replaced transition buffered while a live navigation in its race is still pending', () => {
    const first = routerTransition.startRouterTransition('/a', 'push')!
    const second = routerTransition.startRouterTransition('/b', 'push')!
    routerTransition.markRouterTransitionAsReplaced(first)

    // An unrelated non-navigation state reaches HistoryUpdater (e.g. a
    // refresh): no tracked tree matches, so nothing may be emitted and the
    // race must stay intact.
    routerTransition.commitRouterTransition(makeState(makeTree(), '/'))
    expect(events.filter((e) => e.phase === 'abort')).toHaveLength(0)

    // The live navigation then commits and settles the race.
    const secondTree = makeTree()
    routerTransition.attachRouterTransitionTarget(second, secondTree)
    routerTransition.commitRouterTransition(makeState(secondTree, '/b'))
    const aborts = events.filter((e) => e.phase === 'abort')
    expect(aborts).toHaveLength(1)
    expect(aborts[0].event.id).toBe(first.id)
    expect(aborts[0].event.replacedBy).toBe(second.id)
  })

  it('drops replaced transitions that outlive a commit once no live navigation remains', () => {
    // An older navigation commits while a newer, already-replaced transition
    // (whose replacer previously failed) is still buffered: the newer entry
    // survives the commit's backward sweep, but with no live navigation left
    // it must be dropped rather than linger.
    const first = routerTransition.startRouterTransition('/a', 'push')!
    const firstTree = makeTree()
    routerTransition.attachRouterTransitionTarget(first, firstTree)

    const second = routerTransition.startRouterTransition('/b', 'push')!
    routerTransition.markRouterTransitionAsReplaced(second)
    const third = routerTransition.startRouterTransition('/c', 'push')!
    routerTransition.untrackRouterTransition(third)

    // React commits the first navigation's state (it settled before the
    // others and its commit was already scheduled).
    routerTransition.commitRouterTransition(makeState(firstTree, '/a'))
    expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)

    // A later unrelated navigation must start with a clean slate.
    const fourth = routerTransition.startRouterTransition('/d', 'push')!
    const fourthTree = makeTree()
    routerTransition.attachRouterTransitionTarget(fourth, fourthTree)
    routerTransition.commitRouterTransition(makeState(fourthTree, '/d'))

    const aborts = events.filter((e) => e.phase === 'abort')
    expect(aborts).toHaveLength(0)
    expect(events.filter((e) => e.phase === 'commit')).toHaveLength(2)
  })
})

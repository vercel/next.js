/**
 * @jest-environment jsdom
 */

import { TextEncoder, TextDecoder } from 'util'
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder as any
;(globalThis as any).__webpack_require__ = () => {}
;(globalThis as any).__webpack_chunk_load__ = () => Promise.resolve()

const { completeHardNavigation } =
  require('./app-router-state') as typeof import('./app-router-state')
import type { AppRouterState } from './router-reducer/router-reducer-types'

describe('app-router-state completeHardNavigation', () => {
  it('creates MPA fallback navigation state for failed route requests', () => {
    const previousState: AppRouterState = {
      buildId: 'test-build',
      tree: ['/', {}],
      cache: {
        lazyData: null,
        rsc: null,
        prefetchRsc: null,
        head: null,
        prefetchHead: null,
        parallelRoutes: new Map(),
        loading: null,
      },
      prefetchCache: new Map(),
      pushRef: {
        pendingPush: false,
        mpaNavigation: false,
        preserveCustomHistoryState: false,
      },
      focusAndScrollRef: {
        apply: false,
        onlyHashChange: false,
        hashFragment: null,
        segmentPaths: [],
      },
      canonicalUrl: '/current-page?tab=old',
      renderedSearch: '?tab=old',
      nextUrl: null,
    }

    const targetUrl = new URL('/destination', location.origin)
    const nextState = completeHardNavigation(previousState, targetUrl, 'push')

    expect(nextState.canonicalUrl).toBe('/destination')
    expect(nextState.pushRef.mpaNavigation).toBe(true)
    expect(nextState.pushRef.pendingPush).toBe(true)
  })
})

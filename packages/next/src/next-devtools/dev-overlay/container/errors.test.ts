import {
  createDynamicBodyError,
  createDynamicBodyErrorInNavigation,
  createDynamicMetadataError,
  createDynamicOrRuntimeBodyError,
  createDynamicOrRuntimeMetadataError,
  createDynamicOrRuntimeViewportError,
  createDynamicViewportError,
  createRuntimeBodyError,
  createRuntimeBodyErrorInNavigation,
  createRuntimeMetadataError,
  createRuntimeViewportError,
} from '../../../server/app-render/blocking-route-messages'
import {
  createSyncIOClientError,
  createSyncIOError,
  createSyncIORuntimeError,
  type SyncIOApiType,
} from '../../../server/app-render/sync-io-messages'
import { ClientHookDynamicError } from '../../../server/dynamic-rendering-utils'
import { getCards } from '../components/instant/instant-guidance-data'
import {
  deriveCauseFromCodeFrame,
  getBlockingRouteErrorDetails,
  getLinkPrefetchPartialErrorDetails,
  getUnrenderedSegmentErrorDetails,
  isInstantNavigationError,
  isRuntimeVariant,
  isSyncIOClientError,
  isSyncIOError,
} from './errors'

const ROUTE = '/example'

describe('isRuntimeVariant', () => {
  it('returns true for runtime body factory output', () => {
    expect(isRuntimeVariant(createRuntimeBodyError(ROUTE).message)).toBe(true)
  })

  it('returns false for dynamic body factory output', () => {
    expect(isRuntimeVariant(createDynamicBodyError(ROUTE).message)).toBe(false)
  })

  it('returns true for runtime metadata factory output', () => {
    expect(isRuntimeVariant(createRuntimeMetadataError(ROUTE).message)).toBe(
      true
    )
  })

  it('returns false for dynamic metadata factory output', () => {
    expect(isRuntimeVariant(createDynamicMetadataError(ROUTE).message)).toBe(
      false
    )
  })

  it('returns true for runtime viewport factory output', () => {
    expect(isRuntimeVariant(createRuntimeViewportError(ROUTE).message)).toBe(
      true
    )
  })

  it('returns false for dynamic viewport factory output', () => {
    expect(isRuntimeVariant(createDynamicViewportError(ROUTE).message)).toBe(
      false
    )
  })
})

describe('isSyncIOError', () => {
  it.each<[SyncIOApiType]>([['time'], ['random'], ['crypto']])(
    'returns true for createSyncIOError(%s)',
    (type) => {
      const message = createSyncIOError(ROUTE, 'expr', type).message
      expect(isSyncIOError(message)).toBe(true)
    }
  )

  it.each<[SyncIOApiType]>([['time'], ['random'], ['crypto']])(
    'returns true for createSyncIORuntimeError(%s)',
    (type) => {
      const message = createSyncIORuntimeError(ROUTE, 'expr', type).message
      expect(isSyncIOError(message)).toBe(true)
    }
  )

  it.each<[SyncIOApiType]>([['time'], ['random'], ['crypto']])(
    'returns true for createSyncIOClientError(%s)',
    (type) => {
      const message = createSyncIOClientError(ROUTE, 'expr', type).message
      expect(isSyncIOError(message)).toBe(true)
    }
  )

  it('returns false for non sync-IO factory output', () => {
    expect(isSyncIOError(createRuntimeBodyError(ROUTE).message)).toBe(false)
    expect(isSyncIOError(createDynamicMetadataError(ROUTE).message)).toBe(false)
  })

  it('returns false for an unrelated error message', () => {
    expect(isSyncIOError('Random unrelated error text')).toBe(false)
  })
})

describe('isSyncIOClientError', () => {
  it.each<[SyncIOApiType]>([['time'], ['random'], ['crypto']])(
    'returns true for createSyncIOClientError(%s)',
    (type) => {
      const message = createSyncIOClientError(ROUTE, 'expr', type).message
      expect(isSyncIOClientError(message)).toBe(true)
    }
  )

  it.each<[SyncIOApiType]>([['time'], ['random'], ['crypto']])(
    'returns false for createSyncIOError(%s)',
    (type) => {
      const message = createSyncIOError(ROUTE, 'expr', type).message
      expect(isSyncIOClientError(message)).toBe(false)
    }
  )

  it.each<[SyncIOApiType]>([['time'], ['random'], ['crypto']])(
    'returns false for createSyncIORuntimeError(%s)',
    (type) => {
      const message = createSyncIORuntimeError(ROUTE, 'expr', type).message
      expect(isSyncIOClientError(message)).toBe(false)
    }
  )
})

describe('getBlockingRouteErrorDetails', () => {
  it('classifies client hook errors separately', () => {
    expect(
      getBlockingRouteErrorDetails(
        new ClientHookDynamicError(ROUTE, 'useSearchParams()')
      )
    ).toEqual({
      type: 'client-hook',
      expression: 'useSearchParams()',
    })
  })

  it('classifies useParams() client hook errors', () => {
    expect(
      getBlockingRouteErrorDetails(
        new ClientHookDynamicError(ROUTE, 'useParams()')
      )
    ).toEqual({
      type: 'client-hook',
      expression: 'useParams()',
    })
  })

  it('classifies createRuntimeBodyError as blocking-route + runtime (SSR-only)', () => {
    expect(getBlockingRouteErrorDetails(createRuntimeBodyError(ROUTE))).toEqual(
      { type: 'blocking-route', variant: 'runtime', inNavigation: false }
    )
  })

  it('classifies createDynamicBodyError as blocking-route + dynamic (SSR-only)', () => {
    expect(getBlockingRouteErrorDetails(createDynamicBodyError(ROUTE))).toEqual(
      { type: 'blocking-route', variant: 'dynamic', inNavigation: false }
    )
  })

  it('classifies createRuntimeBodyErrorInNavigation as blocking-route + runtime + inNavigation', () => {
    expect(
      getBlockingRouteErrorDetails(createRuntimeBodyErrorInNavigation(ROUTE))
    ).toEqual({
      type: 'blocking-route',
      variant: 'runtime',
      inNavigation: true,
    })
  })

  it('classifies createDynamicBodyErrorInNavigation as blocking-route + dynamic + inNavigation', () => {
    expect(
      getBlockingRouteErrorDetails(createDynamicBodyErrorInNavigation(ROUTE))
    ).toEqual({
      type: 'blocking-route',
      variant: 'dynamic',
      inNavigation: true,
    })
  })

  it('classifies createDynamicOrRuntimeBodyError as blocking-route + dynamic (SSR-only)', () => {
    // The "either" factory has no clear runtime signal — falls into the
    // dynamic branch by `isRuntimeVariant`. Documents current behavior.
    expect(
      getBlockingRouteErrorDetails(createDynamicOrRuntimeBodyError(ROUTE))
    ).toEqual({
      type: 'blocking-route',
      variant: 'dynamic',
      inNavigation: false,
    })
  })

  it('classifies createRuntimeMetadataError as dynamic-metadata + runtime', () => {
    expect(
      getBlockingRouteErrorDetails(createRuntimeMetadataError(ROUTE))
    ).toEqual({ type: 'dynamic-metadata', variant: 'runtime' })
  })

  it('classifies createDynamicMetadataError as dynamic-metadata + dynamic', () => {
    expect(
      getBlockingRouteErrorDetails(createDynamicMetadataError(ROUTE))
    ).toEqual({ type: 'dynamic-metadata', variant: 'dynamic' })
  })

  it('classifies createDynamicOrRuntimeMetadataError as dynamic-metadata + dynamic', () => {
    expect(
      getBlockingRouteErrorDetails(createDynamicOrRuntimeMetadataError(ROUTE))
    ).toEqual({ type: 'dynamic-metadata', variant: 'dynamic' })
  })

  it('classifies createRuntimeViewportError as dynamic-viewport + runtime', () => {
    expect(
      getBlockingRouteErrorDetails(createRuntimeViewportError(ROUTE))
    ).toEqual({ type: 'dynamic-viewport', variant: 'runtime' })
  })

  it('classifies createDynamicViewportError as dynamic-viewport + dynamic', () => {
    expect(
      getBlockingRouteErrorDetails(createDynamicViewportError(ROUTE))
    ).toEqual({ type: 'dynamic-viewport', variant: 'dynamic' })
  })

  it('classifies createDynamicOrRuntimeViewportError as dynamic-viewport + dynamic', () => {
    expect(
      getBlockingRouteErrorDetails(createDynamicOrRuntimeViewportError(ROUTE))
    ).toEqual({ type: 'dynamic-viewport', variant: 'dynamic' })
  })

  it.each<[SyncIOApiType, string, string]>([
    ['time', 'Date.now()', 'Date.now()'],
    ['random', 'Math.random()', 'Math.random()'],
    ['crypto', 'crypto.randomUUID()', 'crypto.randomUUID()'],
  ])(
    'classifies createSyncIOError(%s) as sync-io + cause %s',
    (type, expression, expectedCause) => {
      expect(
        getBlockingRouteErrorDetails(createSyncIOError(ROUTE, expression, type))
      ).toEqual({ type: 'sync-io', cause: expectedCause })
    }
  )

  it.each<[SyncIOApiType, string, string]>([
    ['time', 'Date.now()', 'Date.now()'],
    ['random', 'Math.random()', 'Math.random()'],
    ['crypto', 'crypto.randomUUID()', 'crypto.randomUUID()'],
  ])(
    'classifies createSyncIOClientError(%s) as sync-io-client + cause %s',
    (type, expression, expectedCause) => {
      expect(
        getBlockingRouteErrorDetails(
          createSyncIOClientError(ROUTE, expression, type)
        )
      ).toEqual({ type: 'sync-io-client', cause: expectedCause })
    }
  )

  // The time-type factory always appends `elapsedTimeBullet` text containing
  // `Date.now()` regardless of which API the user actually called. If
  // SYNC_IO_APIS is ordered wrong, `Date.now()` will match the bullet text
  // and shadow the real cause.
  it.each<[string, string]>([
    ['Date.now()', 'Date.now()'],
    ['new Date()', 'new Date()'],
    ['Date()', 'Date()'],
  ])(
    'preserves cause %s against the `Date.now()` mention in the time bullet',
    (expression, expectedCause) => {
      const error = createSyncIOError(ROUTE, expression, 'time')
      expect(getBlockingRouteErrorDetails(error)).toEqual({
        type: 'sync-io',
        cause: expectedCause,
      })
    }
  )

  it('returns null for an unrelated error', () => {
    expect(getBlockingRouteErrorDetails(new Error('regular bug'))).toBe(null)
  })
})

describe('client hook guidance', () => {
  it('shows Stream and Block cards for useSearchParams', () => {
    const cards = getCards('client-hook', 'runtime', 'useSearchParams()')
    expect(cards.map((card) => card.id)).toEqual([
      'wrap-in-or-move-into-suspense',
      'allow-blocking-route',
    ])
    expect(cards.map((card) => card.group)).toEqual(['stream', 'block'])
  })

  it('shows Stream and Block cards for useParams', () => {
    const cards = getCards('client-hook', 'runtime', 'useParams()')
    expect(cards.map((card) => card.id)).toEqual([
      'wrap-in-or-move-into-suspense',
      'allow-blocking-route',
    ])
    expect(cards.map((card) => card.group)).toEqual(['stream', 'block'])
  })

  it('shows Stream and Block cards for hooks (no GSP)', () => {
    const expected = ['wrap-in-or-move-into-suspense', 'allow-blocking-route']
    expect(
      getCards('client-hook', 'runtime', 'usePathname()').map((c) => c.id)
    ).toEqual(expected)
    expect(
      getCards('client-hook', 'runtime', 'useSelectedLayoutSegment()').map(
        (c) => c.id
      )
    ).toEqual(expected)
    expect(
      getCards('client-hook', 'runtime', 'useSelectedLayoutSegments()').map(
        (c) => c.id
      )
    ).toEqual(expected)
  })
})

describe('card sets for all error families', () => {
  it('blocking-route runtime', () => {
    expect(
      getCards('blocking-route', 'runtime').map((card) => card.id)
    ).toEqual(['wrap-in-or-move-into-suspense', 'allow-blocking-route'])
  })

  it('blocking-route dynamic', () => {
    expect(
      getCards('blocking-route', 'dynamic').map((card) => card.id)
    ).toEqual([
      'wrap-in-or-move-into-suspense',
      'cache-the-component-or-data',
      'allow-blocking-route',
    ])
  })

  it('blocking-route dynamic with connection() drops the cache card', () => {
    expect(
      getCards('blocking-route', 'dynamic', 'connection').map((card) => card.id)
    ).toEqual(['wrap-in-or-move-into-suspense', 'allow-blocking-route'])
  })

  it('metadata runtime', () => {
    expect(getCards('metadata', 'runtime').map((card) => card.id)).toEqual([
      'use-static-metadata',
      'mark-the-route-as-dynamic',
    ])
  })

  it('metadata dynamic', () => {
    expect(getCards('metadata', 'dynamic').map((card) => card.id)).toEqual([
      'cache-the-metadata',
      'mark-the-route-as-dynamic',
    ])
  })

  it('metadata dynamic with connection() drops the cache card', () => {
    expect(
      getCards('metadata', 'dynamic', 'connection').map((card) => card.id)
    ).toEqual(['mark-the-route-as-dynamic'])
  })

  it('viewport runtime', () => {
    expect(getCards('viewport', 'runtime').map((card) => card.id)).toEqual([
      'use-static-viewport',
      'allow-blocking-route',
    ])
  })

  it('viewport dynamic', () => {
    expect(getCards('viewport', 'dynamic').map((card) => card.id)).toEqual([
      'cache-the-viewport-data',
      'allow-blocking-route',
    ])
  })

  it('viewport dynamic with connection() drops the cache card', () => {
    expect(
      getCards('viewport', 'dynamic', 'connection').map((card) => card.id)
    ).toEqual(['allow-blocking-route'])
  })

  it('unrendered-segment', () => {
    expect(
      getCards('unrendered-segment', 'runtime').map((card) => card.id)
    ).toEqual(['render-the-dropped-segment', 'skip-validation-on-the-segment'])
  })

  it('link-prefetch-partial', () => {
    expect(
      getCards('link-prefetch-partial', 'runtime').map((card) => card.id)
    ).toEqual([
      'opt-into-partial-prefetching',
      'use-the-default-prefetch',
      'disable-validation-on-this-route',
    ])
  })

  it('sync-io math', () => {
    expect(
      getCards('sync-io', 'runtime', 'Math.random()').map((card) => card.id)
    ).toEqual([
      'render-at-request-time',
      'cache-the-random-value',
      'render-on-the-client',
    ])
  })

  it('sync-io date', () => {
    expect(
      getCards('sync-io', 'runtime', 'Date.now()').map((card) => card.id)
    ).toEqual([
      'render-at-request-time',
      'cache-the-timestamp',
      'render-on-the-client',
      'measure-elapsed-time',
    ])
  })

  it('sync-io crypto', () => {
    expect(
      getCards('sync-io', 'runtime', 'crypto.randomUUID()').map(
        (card) => card.id
      )
    ).toEqual([
      'render-at-request-time',
      'cache-the-generated-value',
      'render-on-the-client',
    ])
  })

  it('sync-io-client math', () => {
    expect(
      getCards('sync-io-client', 'runtime', 'Math.random()').map(
        (card) => card.id
      )
    ).toEqual([
      'wrap-in-or-move-into-suspense',
      'move-into-effect-or-event-handler',
    ])
  })

  it('sync-io-client date', () => {
    expect(
      getCards('sync-io-client', 'runtime', 'Date.now()').map((card) => card.id)
    ).toEqual([
      'wrap-in-or-move-into-suspense',
      'move-into-effect-or-event-handler',
      'measure-elapsed-time',
    ])
  })

  it('sync-io-client crypto', () => {
    expect(
      getCards('sync-io-client', 'runtime', 'crypto.randomUUID()').map(
        (card) => card.id
      )
    ).toEqual([
      'wrap-in-or-move-into-suspense',
      'move-into-effect-or-event-handler',
    ])
  })
})

describe('getUnrenderedSegmentErrorDetails', () => {
  function createUnrenderedSegmentError(
    route: string,
    files: string[] = []
  ): Error {
    let message = `Route "${route}": Could not validate that a segment in your UI has instant navigation.`
    if (files.length > 0) {
      const label = files.length === 1 ? 'Dropped segment' : 'Dropped segments'
      message +=
        `\n\nThis segment was dropped from rendering. Issues that would prevent instant navigation will go undetected.` +
        `\n\n${label}:\n${files.map((p) => `  ${p}`).join('\n')}` +
        `\n\nWays to fix this:` +
        `\n  - [render] Render the dropped segment` +
        `\n  - [ignore] Set \`export const instant = false\` on the dropped segment to skip validation` +
        `\n\nLearn more: https://nextjs.org/docs/messages/instant-unrendered-segment`
    }
    return new Error(message)
  }

  it('parses route and a single unrendered segment file', () => {
    const error = createUnrenderedSegmentError(ROUTE, ['app/example/page.tsx'])
    expect(getUnrenderedSegmentErrorDetails(error)).toEqual({
      type: 'unrendered-segment',
      route: ROUTE,
      files: ['app/example/page.tsx'],
    })
  })

  it('parses route and multiple unrendered segment files', () => {
    const error = createUnrenderedSegmentError(ROUTE, [
      'app/example/@sidebar/page.tsx',
      'app/example/page.tsx',
    ])
    expect(getUnrenderedSegmentErrorDetails(error)).toEqual({
      type: 'unrendered-segment',
      route: ROUTE,
      files: ['app/example/@sidebar/page.tsx', 'app/example/page.tsx'],
    })
  })

  it('parses route with no segment list (defensive — framework currently always emits one)', () => {
    const error = createUnrenderedSegmentError(ROUTE, [])
    expect(getUnrenderedSegmentErrorDetails(error)).toEqual({
      type: 'unrendered-segment',
      route: ROUTE,
      files: [],
    })
  })

  it('returns null when the headline substring is absent', () => {
    expect(getUnrenderedSegmentErrorDetails(new Error('regular bug'))).toBe(
      null
    )
  })

  it('returns null when the headline matches but the route prefix is missing', () => {
    expect(
      getUnrenderedSegmentErrorDetails(
        new Error(
          'Could not validate that a segment in your UI has instant navigation.'
        )
      )
    ).toBe(null)
  })
})

describe('getLinkPrefetchPartialErrorDetails', () => {
  function createLinkPrefetchPartialError(pathname: string): Error {
    return new Error(
      `Next.js encountered dynamic data during prefetching for "${pathname}".\n\n` +
        `This will lead to slower, more expensive prefetches.`
    )
  }

  it('parses the pathname', () => {
    expect(
      getLinkPrefetchPartialErrorDetails(
        createLinkPrefetchPartialError('/dashboard')
      )
    ).toEqual({
      type: 'link-prefetch-partial',
      pathname: '/dashboard',
    })
  })

  it('returns null for an unrelated error', () => {
    expect(getLinkPrefetchPartialErrorDetails(new Error('regular bug'))).toBe(
      null
    )
  })

  it('returns null when the headline matches but the prefix is wrong', () => {
    expect(
      getLinkPrefetchPartialErrorDetails(
        new Error(
          'Some preamble: Next.js encountered dynamic data during prefetching for "/x".'
        )
      )
    ).toBe(null)
  })
})

describe('isInstantNavigationError', () => {
  function createUnrenderedSegmentError(route: string): Error {
    return new Error(
      `Route "${route}": Could not validate that a segment in your UI has instant navigation.\n\nDropped segment:\n  app/example/page.tsx`
    )
  }

  it('returns true for navigation-phase blocking-route errors', () => {
    expect(
      isInstantNavigationError(createRuntimeBodyErrorInNavigation(ROUTE))
    ).toBe(true)
    expect(
      isInstantNavigationError(createDynamicBodyErrorInNavigation(ROUTE))
    ).toBe(true)
  })

  it('returns true for unrendered-segment errors', () => {
    expect(isInstantNavigationError(createUnrenderedSegmentError(ROUTE))).toBe(
      true
    )
  })

  it('returns true for link-prefetch-partial warnings', () => {
    const error = new Error(
      `Next.js encountered dynamic data during prefetching for "/dashboard".`
    )
    expect(isInstantNavigationError(error)).toBe(true)
  })

  it('returns false for prerender-phase blocking-route errors', () => {
    expect(isInstantNavigationError(createRuntimeBodyError(ROUTE))).toBe(false)
    expect(isInstantNavigationError(createDynamicBodyError(ROUTE))).toBe(false)
  })

  it('returns false for metadata/viewport/sync-io errors', () => {
    expect(isInstantNavigationError(createDynamicMetadataError(ROUTE))).toBe(
      false
    )
    expect(isInstantNavigationError(createRuntimeViewportError(ROUTE))).toBe(
      false
    )
    expect(
      isInstantNavigationError(
        createSyncIOError(ROUTE, 'Math.random()', 'random')
      )
    ).toBe(false)
  })

  it('returns false for unrelated errors', () => {
    expect(isInstantNavigationError(new Error('regular bug'))).toBe(false)
  })
})

describe('deriveCauseFromCodeFrame', () => {
  const connectionFrame = `  3 | export default async function Page() {\n> 4 |   await connection();\n    |                   ^\n  5 |   return <p>OK</p>;`
  const fetchFrame = `  1 | export default async function Page() {\n> 2 |   const r = await fetch("/api");\n    |                     ^\n  3 |   return <p>{r.status}</p>;`

  it('returns "connection" when the highlighted line calls connection()', () => {
    expect(
      deriveCauseFromCodeFrame('blocking-route', 'dynamic', connectionFrame)
    ).toBe('connection')
    expect(
      deriveCauseFromCodeFrame('metadata', 'dynamic', connectionFrame)
    ).toBe('connection')
    expect(
      deriveCauseFromCodeFrame('viewport', 'dynamic', connectionFrame)
    ).toBe('connection')
  })

  it('returns undefined when the highlighted line is a fetch/db call', () => {
    expect(
      deriveCauseFromCodeFrame('blocking-route', 'dynamic', fetchFrame)
    ).toBeUndefined()
  })

  it('returns undefined for runtime variant even if connection() is in scope', () => {
    expect(
      deriveCauseFromCodeFrame('blocking-route', 'runtime', connectionFrame)
    ).toBeUndefined()
  })

  it('returns undefined for kinds that do not show a cache card', () => {
    expect(
      deriveCauseFromCodeFrame('client-hook', 'dynamic', connectionFrame)
    ).toBeUndefined()
    expect(
      deriveCauseFromCodeFrame('sync-io', 'dynamic', connectionFrame)
    ).toBeUndefined()
  })

  it('returns undefined when there is no code frame', () => {
    expect(
      deriveCauseFromCodeFrame('blocking-route', 'dynamic', null)
    ).toBeUndefined()
    expect(
      deriveCauseFromCodeFrame('blocking-route', 'dynamic', undefined)
    ).toBeUndefined()
  })

  it('does not match when connection() appears only in a non-highlighted line', () => {
    const frame = `  1 | import { connection } from "next/server";\n> 2 |   await fetch("/api");\n    |         ^`
    expect(
      deriveCauseFromCodeFrame('blocking-route', 'dynamic', frame)
    ).toBeUndefined()
  })
})

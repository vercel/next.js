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
import {
  getBlockingRouteErrorDetails,
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
        `\n  - Render the dropped segment` +
        `\n  - Set \`export const instant = false\` on the dropped segment to skip validation` +
        `\n\nLearn more: https://nextjs.org/docs/messages/unrendered-instant-segment`
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

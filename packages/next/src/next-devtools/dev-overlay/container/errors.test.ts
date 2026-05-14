import {
  createDynamicBodyError,
  createDynamicMetadataError,
  createDynamicOrRuntimeBodyError,
  createDynamicOrRuntimeMetadataError,
  createDynamicOrRuntimeViewportError,
  createDynamicViewportError,
  createRuntimeBodyError,
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
  isRuntimeVariant,
  isSyncIOClientError,
  isSyncIOError,
} from './errors'

const ROUTE = '/example'

// Every detection helper in errors.tsx walks the user-facing error message
// produced by the server-side factories in `blocking-route-messages.ts` and
// `sync-io-messages.ts`. These tests guard the contract between the two
// modules: if a factory's wording shifts in a way the detector can't
// recognize, classification silently falls back to "not an instant error"
// and the overlay shows the wrong UI. Three regressions in this exact spot
// during the redesign motivated this test.

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
  it('classifies createRuntimeBodyError as blocking-route + runtime', () => {
    expect(getBlockingRouteErrorDetails(createRuntimeBodyError(ROUTE))).toEqual(
      { type: 'blocking-route', variant: 'runtime' }
    )
  })

  it('classifies createDynamicBodyError as blocking-route + navigation', () => {
    expect(getBlockingRouteErrorDetails(createDynamicBodyError(ROUTE))).toEqual(
      { type: 'blocking-route', variant: 'navigation' }
    )
  })

  it('classifies createDynamicOrRuntimeBodyError as blocking-route + navigation', () => {
    // The "either" factory has no clear runtime signal — falls into the
    // navigation branch by `isRuntimeVariant`. Documents current behavior.
    expect(
      getBlockingRouteErrorDetails(createDynamicOrRuntimeBodyError(ROUTE))
    ).toEqual({ type: 'blocking-route', variant: 'navigation' })
  })

  it('classifies createRuntimeMetadataError as dynamic-metadata + runtime', () => {
    expect(
      getBlockingRouteErrorDetails(createRuntimeMetadataError(ROUTE))
    ).toEqual({ type: 'dynamic-metadata', variant: 'runtime' })
  })

  it('classifies createDynamicMetadataError as dynamic-metadata + navigation', () => {
    expect(
      getBlockingRouteErrorDetails(createDynamicMetadataError(ROUTE))
    ).toEqual({ type: 'dynamic-metadata', variant: 'navigation' })
  })

  it('classifies createDynamicOrRuntimeMetadataError as dynamic-metadata + navigation', () => {
    expect(
      getBlockingRouteErrorDetails(createDynamicOrRuntimeMetadataError(ROUTE))
    ).toEqual({ type: 'dynamic-metadata', variant: 'navigation' })
  })

  it('classifies createRuntimeViewportError as dynamic-viewport + runtime', () => {
    expect(
      getBlockingRouteErrorDetails(createRuntimeViewportError(ROUTE))
    ).toEqual({ type: 'dynamic-viewport', variant: 'runtime' })
  })

  it('classifies createDynamicViewportError as dynamic-viewport + navigation', () => {
    expect(
      getBlockingRouteErrorDetails(createDynamicViewportError(ROUTE))
    ).toEqual({ type: 'dynamic-viewport', variant: 'navigation' })
  })

  it('classifies createDynamicOrRuntimeViewportError as dynamic-viewport + navigation', () => {
    expect(
      getBlockingRouteErrorDetails(createDynamicOrRuntimeViewportError(ROUTE))
    ).toEqual({ type: 'dynamic-viewport', variant: 'navigation' })
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

import {
  areQueryEntryValuesEqual,
  areQuerySnapshotsEqual,
  computeInitialRewriteReconciliationState,
  computeInitialRewriteReconciliationStateFromRewrites,
  computeMatchedRewriteReconciliationFromSnapshots,
  getRewriteReconciliationGuardState,
} from './rewrite-reconciliation'

describe('areQueryEntryValuesEqual', () => {
  it('should stay true when scalar entry values are identical', () => {
    expect(areQueryEntryValuesEqual('bar', 'bar')).toBe(true)
  })

  it('should stay false when one entry value is scalar and the other is an array', () => {
    expect(areQueryEntryValuesEqual('bar', ['bar'])).toBe(false)
  })
})

describe('areQuerySnapshotsEqual', () => {
  it('should stay true when query snapshots are identical', () => {
    expect(areQuerySnapshotsEqual({ foo: 'bar' }, { foo: 'bar' })).toBe(true)
  })

  it('should stay false when query snapshots have different key sets', () => {
    expect(areQuerySnapshotsEqual({ foo: 'bar' }, { baz: 'bar' })).toBe(false)
  })
})

describe('computeMatchedRewriteReconciliationFromSnapshots', () => {
  it('should stay not-required when the route and query are already correct', () => {
    expect(
      computeMatchedRewriteReconciliationFromSnapshots(
        '/target',
        '/target',
        {},
        {}
      )
    ).toBe('not-required')
  })

  it('should stay required when the effective query changes', () => {
    expect(
      computeMatchedRewriteReconciliationFromSnapshots(
        '/gsp',
        '/gsp',
        {},
        {
          foo: 'bar',
        }
      )
    ).toBe('required')
  })

  it('should stay not-required when array query values have the same contents', () => {
    expect(
      computeMatchedRewriteReconciliationFromSnapshots(
        '/docs',
        '/docs',
        { slug: ['a', 'b'] },
        { slug: ['a', 'b'] }
      )
    ).toBe('not-required')
  })

  it('should stay required when array query values change order', () => {
    expect(
      computeMatchedRewriteReconciliationFromSnapshots(
        '/docs',
        '/docs',
        { slug: ['a', 'b'] },
        { slug: ['b', 'a'] }
      )
    ).toBe('required')
  })
})

describe('getRewriteReconciliationGuardState', () => {
  it('should stay unknown for an external destination', () => {
    expect(
      getRewriteReconciliationGuardState(true, false, false, false, undefined)
    ).toBe('unknown')
  })

  it('should stay not-required when no internal rewrite matched', () => {
    expect(
      getRewriteReconciliationGuardState(false, false, false, false, undefined)
    ).toBe('not-required')
  })

  it('should stay unknown when the matched rewrite is non-deterministic', () => {
    expect(
      getRewriteReconciliationGuardState(false, true, true, true, '/gsp')
    ).toBe('unknown')
  })

  it('should stay unknown when a rewrite matched without a stable page identity', () => {
    expect(
      getRewriteReconciliationGuardState(false, true, false, false, undefined)
    ).toBe('unknown')
  })

  it('should stay undefined when exact snapshot comparison can continue', () => {
    expect(
      getRewriteReconciliationGuardState(false, true, false, true, '/gsp')
    ).toBeUndefined()
  })
})

describe('computeInitialRewriteReconciliationStateFromRewrites', () => {
  const pages = ['/', '/gsp']

  it('should stay not-required when no rewrites are configured', () => {
    expect(
      computeInitialRewriteReconciliationStateFromRewrites(
        '/gsp',
        {},
        '/gsp',
        pages,
        {
          beforeFiles: [],
          afterFiles: [],
          fallback: [],
        },
        undefined,
        undefined
      )
    ).toBe('not-required')
  })

  it('should stay not-required when a rewrite exists on another route', () => {
    expect(
      computeInitialRewriteReconciliationStateFromRewrites(
        '/gsp',
        {},
        '/gsp',
        pages,
        {
          beforeFiles: [],
          afterFiles: [
            {
              source: '/rewrite-to-gsp',
              destination: '/gsp?foo=bar',
              initialReconciliationDeterministic: true,
            },
          ],
          fallback: [],
        },
        undefined,
        undefined
      )
    ).toBe('not-required')
  })

  it('should stay required when a safe rewrite changes the effective query', () => {
    expect(
      computeInitialRewriteReconciliationStateFromRewrites(
        '/gsp',
        {},
        '/rewrite-to-gsp',
        pages,
        {
          beforeFiles: [],
          afterFiles: [
            {
              source: '/rewrite-to-gsp',
              destination: '/gsp?foo=bar',
              initialReconciliationDeterministic: true,
            },
          ],
          fallback: [],
        },
        undefined,
        undefined
      )
    ).toBe('required')
  })

  it('should stay not-required when a safe rewrite resolves to the initial snapshot', () => {
    expect(
      computeInitialRewriteReconciliationStateFromRewrites(
        '/gsp',
        {},
        '/rewrite-to-gsp',
        pages,
        {
          beforeFiles: [],
          afterFiles: [
            {
              source: '/rewrite-to-gsp',
              destination: '/gsp',
              initialReconciliationDeterministic: true,
            },
          ],
          fallback: [],
        },
        undefined,
        undefined
      )
    ).toBe('not-required')
  })

  it('should stay unknown when a matching rewrite is outside the safe subset', () => {
    expect(
      computeInitialRewriteReconciliationStateFromRewrites(
        '/gsp',
        {},
        '/rewrite-to-gsp',
        pages,
        {
          beforeFiles: [],
          afterFiles: [
            {
              source: '/rewrite-to-gsp',
              destination: '/gsp?foo=bar',
              initialReconciliationDeterministic: false,
            },
          ],
          fallback: [],
        },
        undefined,
        undefined
      )
    ).toBe('unknown')
  })
})

describe('computeInitialRewriteReconciliationState', () => {
  const originalHasRewrites = process.env.__NEXT_HAS_REWRITES

  afterEach(() => {
    process.env.__NEXT_HAS_REWRITES = originalHasRewrites
  })

  it('should stay not-required when rewrites are not configured', async () => {
    delete process.env.__NEXT_HAS_REWRITES

    await expect(
      computeInitialRewriteReconciliationState(
        undefined,
        '/gsp',
        {},
        '/gsp',
        undefined,
        undefined,
        async () => {
          throw new Error('should not load pages')
        },
        async () => {
          throw new Error('should not load rewrites')
        }
      )
    ).resolves.toBe('not-required')
  })

  it('should reuse an exact serialized server result', async () => {
    process.env.__NEXT_HAS_REWRITES = 'true'

    await expect(
      computeInitialRewriteReconciliationState(
        'required',
        '/gsp',
        {},
        '/rewrite-to-gsp',
        undefined,
        undefined,
        async () => {
          throw new Error('should not load pages')
        },
        async () => {
          throw new Error('should not load rewrites')
        }
      )
    ).resolves.toBe('required')
  })

  it('should stay unknown when the client build data cannot be loaded', async () => {
    process.env.__NEXT_HAS_REWRITES = 'true'

    await expect(
      computeInitialRewriteReconciliationState(
        undefined,
        '/gsp',
        {},
        '/rewrite-to-gsp',
        undefined,
        undefined,
        async () => {
          throw new Error('page list failed')
        },
        async () => ({
          __rewrites: {
            beforeFiles: [],
            afterFiles: [],
            fallback: [],
          },
        })
      )
    ).resolves.toBe('unknown')
  })
})

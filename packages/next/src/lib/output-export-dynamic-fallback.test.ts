import {
  isOutputExportDynamicFallbackEnabled,
  isOutputExportOptimisticRoutingEnabled,
  isOutputExportVaryParamsEnabled,
} from './output-export-dynamic-fallback'

describe('output export dynamic fallback flags', () => {
  it('enables export fallback only for output export with cache components', () => {
    expect(
      isOutputExportDynamicFallbackEnabled({
        output: 'export',
        cacheComponents: true,
      })
    ).toBe(true)

    expect(
      isOutputExportDynamicFallbackEnabled({
        output: 'standalone',
        cacheComponents: true,
      })
    ).toBe(false)

    expect(
      isOutputExportDynamicFallbackEnabled({
        output: 'export',
        cacheComponents: false,
      })
    ).toBe(false)
  })

  it('implies optimistic routing for export fallback routes', () => {
    expect(
      isOutputExportOptimisticRoutingEnabled({
        output: 'export',
        cacheComponents: true,
      })
    ).toBe(true)

    expect(
      isOutputExportOptimisticRoutingEnabled({
        output: 'standalone',
        cacheComponents: false,
        experimental: { optimisticRouting: true },
      })
    ).toBe(true)

    expect(
      isOutputExportOptimisticRoutingEnabled({
        output: 'standalone',
        cacheComponents: false,
        experimental: { optimisticRouting: false },
      })
    ).toBe(false)
  })

  it('implies vary params for export fallback routes', () => {
    expect(
      isOutputExportVaryParamsEnabled({
        output: 'export',
        cacheComponents: true,
      })
    ).toBe(true)

    expect(
      isOutputExportVaryParamsEnabled({
        output: 'standalone',
        cacheComponents: false,
        experimental: { varyParams: true },
      })
    ).toBe(true)

    expect(
      isOutputExportVaryParamsEnabled({
        output: 'standalone',
        cacheComponents: false,
        experimental: { varyParams: false },
      })
    ).toBe(false)
  })
})

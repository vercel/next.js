import {
  getOutputExportFallbackPath,
  getOutputExportFallbackStaticPrefix,
  isOutputExportDynamicFallbackEnabled,
  isOutputExportOptimisticRoutingEnabled,
  isOutputExportVaryParamsEnabled,
} from './output-export-dynamic-fallback'

describe('output export dynamic fallback', () => {
  it('derives the fallback path from a static route prefix', () => {
    expect(getOutputExportFallbackPath('org/acme/chat')).toBe(
      '/org/acme/chat/__fallback'
    )
    expect(getOutputExportFallbackPath('')).toBe('/__fallback')
  })

  it('derives the static prefix before the first dynamic segment', () => {
    expect(
      getOutputExportFallbackStaticPrefix('/org/[org]/chat/[thread]')
    ).toBe('org')
    expect(getOutputExportFallbackStaticPrefix('/[locale]/blog/[slug]')).toBe(
      ''
    )
    expect(getOutputExportFallbackStaticPrefix('/org/acme/chat')).toBeNull()
  })

  it('stays behind output export, cache components, and the explicit flag', () => {
    expect(
      isOutputExportDynamicFallbackEnabled({
        output: 'export',
        cacheComponents: true,
        experimental: { outputExportDynamicFallbacks: true },
      })
    ).toBe(true)

    expect(
      isOutputExportDynamicFallbackEnabled({
        output: 'export',
        cacheComponents: true,
      })
    ).toBe(false)

    expect(
      isOutputExportDynamicFallbackEnabled({
        output: 'standalone',
        cacheComponents: true,
        experimental: { outputExportDynamicFallbacks: true },
      })
    ).toBe(false)
  })

  it('uses the fallback flag to imply the routing flags used by the client path', () => {
    const enabledConfig = {
      output: 'export',
      cacheComponents: true,
      experimental: { outputExportDynamicFallbacks: true },
    }

    expect(isOutputExportOptimisticRoutingEnabled(enabledConfig)).toBe(true)
    expect(isOutputExportVaryParamsEnabled(enabledConfig)).toBe(true)

    expect(
      isOutputExportOptimisticRoutingEnabled({
        output: 'export',
        cacheComponents: true,
        experimental: { optimisticRouting: true },
      })
    ).toBe(true)
    expect(
      isOutputExportVaryParamsEnabled({
        output: 'export',
        cacheComponents: true,
        experimental: { varyParams: true },
      })
    ).toBe(true)
  })
})

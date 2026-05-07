import {
  getOutputExportFallbackPath,
  getOutputExportFallbackStaticPrefix,
  isOutputExportDynamicFallbackEnabled,
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

  it('stays behind the explicit export fallback flag', () => {
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
})

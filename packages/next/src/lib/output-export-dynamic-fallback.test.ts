import {
  getOutputExportFallbackConflicts,
  getOutputExportFallbackMetadataPath,
  getOutputExportFallbackPath,
  getOutputExportFallbackStaticPrefix,
  getOutputExportFallbackVariantPath,
  isOutputExportDynamicFallbackEnabled,
  isOutputExportOptimisticRoutingEnabled,
  isOutputExportVaryParamsEnabled,
  needsOutputExportFallbackManifest,
} from './output-export-dynamic-fallback'
import { planOutputExportFallbackRoutes } from './output-export-fallback-routes'

describe('output export dynamic fallback flags', () => {
  it('derives the fallback path contract from a static prefix', () => {
    expect(getOutputExportFallbackPath('org/acme/chat')).toBe(
      '/org/acme/chat/__fallback'
    )
    expect(getOutputExportFallbackPath('')).toBe('/__fallback')
    expect(getOutputExportFallbackMetadataPath('/org/__fallback')).toBe(
      '/org/__fallback.meta.json'
    )
    expect(getOutputExportFallbackVariantPath('/org/__fallback', 1)).toBe(
      '/org/__fallback/__route_1'
    )
  })

  it('derives the static prefix before the first dynamic segment', () => {
    expect(getOutputExportFallbackStaticPrefix('/org/acme/chat/[thread]')).toBe(
      'org/acme/chat'
    )
    expect(getOutputExportFallbackStaticPrefix('/[locale]/blog/[slug]')).toBe(
      ''
    )
    expect(getOutputExportFallbackStaticPrefix('/org/acme/chat')).toBeNull()
  })

  it('derives the static prefix before an intercepted dynamic segment', () => {
    expect(getOutputExportFallbackStaticPrefix('/feed/(.)[id]')).toBe('feed')
    expect(getOutputExportFallbackStaticPrefix('/(.)[id]')).toBe('')
  })

  it('detects manifest needs for intercepted dynamic segments', () => {
    expect(needsOutputExportFallbackManifest('/feed/(.)[id]/comments')).toBe(
      true
    )
    expect(
      needsOutputExportFallbackManifest('/feed/(.)[...slug]/comments')
    ).toBe(false)
  })

  it('detects conflicting dynamic fallback routes that share one static prefix', () => {
    expect(
      getOutputExportFallbackConflicts([
        '/docs/[...slug]',
        '/docs/[section]/[page]',
        '/blog/[slug]',
      ])
    ).toEqual([
      {
        fallbackPath: '/docs/__fallback',
        routes: ['/docs/[...slug]', '/docs/[section]/[page]'],
      },
    ])
  })

  it('does not flag non-conflicting fallback routes with different prefixes', () => {
    expect(
      getOutputExportFallbackConflicts([
        '/org/[org]/chat/[thread]',
        '/org/acme/chat/[thread]',
        '/docs/[...slug]',
      ])
    ).toEqual([])
  })

  it('plans fallback route variants for shared exporter and adapter routing', () => {
    expect(
      planOutputExportFallbackRoutes({
        '/docs/[...slug]': {
          fallbackSourceRoute: '/docs/[...slug]',
          fallbackRouteParams: [{ paramName: 'slug', paramType: 'catchall' }],
        },
        '/docs/[section]/[page]': {
          fallbackSourceRoute: '/docs/[section]/[page]',
          fallbackRouteParams: [
            { paramName: 'section', paramType: 'dynamic' },
            { paramName: 'page', paramType: 'dynamic' },
          ],
        },
        '/blog/[slug]/comments': {
          fallbackSourceRoute: '/blog/[slug]/comments',
          fallbackRouteParams: [{ paramName: 'slug', paramType: 'dynamic' }],
        },
        '/static': {
          fallbackSourceRoute: '/static',
          fallbackRouteParams: [{ paramName: 'unused', paramType: 'dynamic' }],
        },
      })
    ).toEqual([
      {
        fallbackRoute: '/blog/__fallback',
        needsManifest: true,
        entries: [
          {
            route: '/blog/[slug]/comments',
            fallbackSourceRoute: '/blog/[slug]/comments',
            fallbackRoute: '/blog/__fallback',
            fallbackPath: '/blog/__fallback',
            staticPrefix: 'blog',
          },
        ],
      },
      {
        fallbackRoute: '/docs/__fallback',
        needsManifest: true,
        entries: [
          {
            route: '/docs/[section]/[page]',
            fallbackSourceRoute: '/docs/[section]/[page]',
            fallbackRoute: '/docs/__fallback',
            fallbackPath: '/docs/__fallback/__route_0',
            staticPrefix: 'docs',
          },
          {
            route: '/docs/[...slug]',
            fallbackSourceRoute: '/docs/[...slug]',
            fallbackRoute: '/docs/__fallback',
            fallbackPath: '/docs/__fallback/__route_1',
            staticPrefix: 'docs',
          },
        ],
      },
    ])
  })

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
        experimental: { optimisticRouting: false },
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

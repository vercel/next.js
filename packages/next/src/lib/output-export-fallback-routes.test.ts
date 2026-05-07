import { planOutputExportFallbackRoutes } from './output-export-fallback-routes'

describe('planOutputExportFallbackRoutes', () => {
  it('uses the shared fallback path for a single dynamic segment route', () => {
    expect(
      planOutputExportFallbackRoutes({
        '/docs/[slug]': {
          fallbackSourceRoute: '/docs/[slug]',
          fallbackRouteParams: [{ paramName: 'slug', paramType: 'd' }],
        },
      })
    ).toEqual([
      {
        fallbackRoute: '/docs/__fallback',
        needsManifest: false,
        entries: [
          {
            route: '/docs/[slug]',
            fallbackSourceRoute: '/docs/[slug]',
            fallbackRoute: '/docs/__fallback',
            fallbackPath: '/docs/__fallback',
            staticPrefix: 'docs',
          },
        ],
      },
    ])
  })

  it('keeps a manifest for a single route with static segments after the first dynamic segment', () => {
    expect(
      planOutputExportFallbackRoutes({
        '/docs/[section]/intro': {
          fallbackSourceRoute: '/docs/[section]/intro',
          fallbackRouteParams: [{ paramName: 'section', paramType: 'd' }],
        },
      })
    ).toEqual([
      {
        fallbackRoute: '/docs/__fallback',
        needsManifest: true,
        entries: [
          {
            route: '/docs/[section]/intro',
            fallbackSourceRoute: '/docs/[section]/intro',
            fallbackRoute: '/docs/__fallback',
            fallbackPath: '/docs/__fallback',
            staticPrefix: 'docs',
          },
        ],
      },
    ])
  })

  it('assigns deterministic variant paths for multiple routes with the same fallback route', () => {
    expect(
      planOutputExportFallbackRoutes({
        '/docs/[section]/reference': {
          fallbackSourceRoute: '/docs/[section]/reference',
          fallbackRouteParams: [{ paramName: 'section', paramType: 'd' }],
        },
        '/docs/[section]/guide': {
          fallbackSourceRoute: '/docs/[section]/guide',
          fallbackRouteParams: [{ paramName: 'section', paramType: 'd' }],
        },
      })
    ).toEqual([
      {
        fallbackRoute: '/docs/__fallback',
        needsManifest: true,
        entries: [
          {
            route: '/docs/[section]/guide',
            fallbackSourceRoute: '/docs/[section]/guide',
            fallbackRoute: '/docs/__fallback',
            fallbackPath: '/docs/__fallback/__route_0',
            staticPrefix: 'docs',
          },
          {
            route: '/docs/[section]/reference',
            fallbackSourceRoute: '/docs/[section]/reference',
            fallbackRoute: '/docs/__fallback',
            fallbackPath: '/docs/__fallback/__route_1',
            staticPrefix: 'docs',
          },
        ],
      },
    ])
  })
})

import { generateLinkTypesFile } from './typegen'
import type { RouteTypesManifest } from './route-types-utils'

function makeEmptyManifest(
  overrides: Partial<RouteTypesManifest> = {}
): RouteTypesManifest {
  return {
    appRoutes: {},
    pageRoutes: {},
    layoutRoutes: {},
    appRouteHandlerRoutes: {},
    redirectRoutes: {},
    rewriteRoutes: {},
    appPagePaths: new Set(),
    pagesRouterPagePaths: new Set(),
    layoutPaths: new Set(),
    appRouteHandlers: new Set(),
    pageApiRoutes: new Set(),
    filePathToRoute: new Map(),
    rootParams: new Map(),
    ...overrides,
  }
}

describe('generateRouteTypesFile — rewrite routes with prefixed params', () => {
  it('converts /@[username] rewrite source to a template literal type', () => {
    const manifest = makeEmptyManifest({
      rewriteRoutes: {
        '/@[username]': { path: 'app/[username]/page.tsx', groups: {} },
      },
    })

    const output = generateLinkTypesFile(manifest)

    // Should appear in the DynamicRoutes template literal section
    expect(output).toContain('/@${SafeSlug<T>}')
    // Should NOT remain as a static string literal
    expect(output).not.toContain('"/@[username]"')
  })

  it('converts /~[slug] rewrite source to a template literal type', () => {
    const manifest = makeEmptyManifest({
      rewriteRoutes: {
        '/~[slug]': { path: 'app/[slug]/page.tsx', groups: {} },
      },
    })

    const output = generateLinkTypesFile(manifest)

    expect(output).toContain('/~${SafeSlug<T>}')
    expect(output).not.toContain('"/~[slug]"')
  })

  it('still handles plain /[slug] rewrite routes correctly', () => {
    const manifest = makeEmptyManifest({
      rewriteRoutes: {
        '/[slug]': { path: 'app/[slug]/page.tsx', groups: {} },
      },
    })

    const output = generateLinkTypesFile(manifest)

    expect(output).toContain('/${SafeSlug<T>}`')
  })
})

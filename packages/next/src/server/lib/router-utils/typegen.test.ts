/* eslint-env jest */

import type { RouteTypesManifest } from './route-types-utils'
import { generateLinkTypesFile, generateRouteTypesFile } from './typegen'

function createManifest(
  rewriteRoutes: RouteTypesManifest['rewriteRoutes']
): RouteTypesManifest {
  return {
    appRoutes: {},
    pageRoutes: {},
    layoutRoutes: {},
    appRouteHandlerRoutes: {},
    redirectRoutes: {},
    rewriteRoutes,
    appPagePaths: new Set(),
    pagesRouterPagePaths: new Set(),
    layoutPaths: new Set(),
    appRouteHandlers: new Set(),
    pageApiRoutes: new Set(),
    filePathToRoute: new Map(),
    rootParams: new Map(),
  }
}

const group = { pos: 1, repeat: false, optional: false }

describe('typedRoutes route types for custom route sources', () => {
  it('turns a prefixed dynamic segment into a template literal type', () => {
    const manifest = createManifest({
      '/@[username]': { path: 'next.config.js', groups: { username: group } },
      '/files/v-[id]/[...rest]': {
        path: 'next.config.js',
        groups: {
          id: { ...group, pos: 1 },
          rest: { pos: 2, repeat: true, optional: false },
        },
      },
    })

    const link = generateLinkTypesFile(manifest)
    expect(link).toContain(`\`/@\${SafeSlug<T>}\``)
    expect(link).toContain(`\`/files/v-\${SafeSlug<T>}/\${CatchAllSlug<T>}\``)
    expect(link).not.toContain('`/@[username]`')

    const routes = generateRouteTypesFile(manifest)
    expect(routes).toContain('"/@[username]": { "username": string; }')
  })
})

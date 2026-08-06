import type { RouteInfo } from '../../../build/file-classifier'
import { createRouteTypesManifest } from './route-types-utils'

describe('createRouteTypesManifest root params', () => {
  function createManifest(layoutRoutes: RouteInfo[]) {
    return createRouteTypesManifest({
      dir: '/project',
      pageRoutes: [],
      appRoutes: [],
      appRouteHandlers: [],
      pageApiRoutes: [],
      layoutRoutes,
      slots: [],
    })
  }

  it('should collect root params from sibling root layouts', async () => {
    const manifest = await createManifest([
      { route: '/', filePath: '/project/app/(marketing)/layout.tsx' },
      { route: '/[locale]', filePath: '/project/app/[locale]/layout.tsx' },
    ])

    expect(manifest.rootParams).toEqual(
      new Map([['locale', new Set(['string', 'undefined'])]])
    )
  })

  it('should not collect params from layouts below the root layout', async () => {
    const manifest = await createManifest([
      { route: '/', filePath: '/project/app/layout.tsx' },
      { route: '/[locale]', filePath: '/project/app/[locale]/layout.tsx' },
    ])

    expect(manifest.rootParams).toEqual(new Map())
  })

  it('should not collect params from layouts below a root layout in a route group', async () => {
    const manifest = await createManifest([
      { route: '/', filePath: '/project/app/(marketing)/layout.tsx' },
      { route: '/', filePath: '/project/app/(shop)/layout.tsx' },
      {
        route: '/[locale]',
        filePath: '/project/app/(shop)/[locale]/layout.tsx',
      },
    ])

    expect(manifest.rootParams).toEqual(new Map())
  })
})

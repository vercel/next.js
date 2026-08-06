import { createRouteTypesManifest } from './route-types-utils'

describe('route types manifest root params', () => {
  function createManifest(layoutRoutes: { route: string; filePath: string }[]) {
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
})

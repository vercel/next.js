import path from 'path'
import { createRouteTypesManifest } from './route-types-utils'

const dir = path.join(path.sep, 'project')

// `route` has route groups stripped, like the layout routes produced by route
// discovery, while `filePath` keeps the real directory structure.
function layout(route: string, ...segments: string[]) {
  return { route, filePath: path.join(dir, 'app', ...segments, 'layout.tsx') }
}

async function getRootParams(layoutRoutes: ReturnType<typeof layout>[]) {
  const manifest = await createRouteTypesManifest({
    dir,
    pageRoutes: [],
    appRoutes: [],
    appRouteHandlers: [],
    pageApiRoutes: [],
    layoutRoutes,
    slots: [],
  })

  return Object.fromEntries(
    [...manifest.rootParams].map(([name, types]) => [name, [...types].sort()])
  )
}

describe('createRouteTypesManifest root params', () => {
  it('collects params from a single root layout', async () => {
    expect(await getRootParams([layout('/[locale]', '[locale]')])).toEqual({
      locale: ['string'],
    })
  })

  it('ignores params of layouts nested below the root layout', async () => {
    expect(
      await getRootParams([layout('/'), layout('/[locale]', '[locale]')])
    ).toEqual({})
  })

  it('treats a layout in a route group as a root layout next to a sibling root layout', async () => {
    // (marketing)/layout.tsx is served at "/", but it is not an ancestor of
    // [locale]/layout.tsx, so both are root layouts.
    expect(
      await getRootParams([
        layout('/', '(marketing)'),
        layout('/[locale]', '[locale]'),
      ])
    ).toEqual({
      locale: ['string', 'undefined'],
    })
  })

  it('does not treat layouts nested in a route group as root layouts', async () => {
    expect(
      await getRootParams([
        layout('/', '(marketing)'),
        layout('/shop/[id]', '(marketing)', 'shop', '[id]'),
        layout('/[locale]', '[locale]'),
      ])
    ).toEqual({
      locale: ['string', 'undefined'],
    })
  })
})

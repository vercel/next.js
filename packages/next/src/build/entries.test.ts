import type { NextConfigComplete } from '../server/config-shared'
import type { PageStaticInfo } from './analysis/get-page-static-info'
import { PAGES_DIR_ALIAS } from '../lib/constants'
import { createEntrypoints, type CreateEntrypointsParams } from './entries'
import { getStaticInfoIncludingLayouts } from './get-static-info-including-layouts'

jest.mock('./get-static-info-including-layouts', () => ({
  getStaticInfoIncludingLayouts: jest.fn(),
}))

const mockedGetStaticInfoIncludingLayouts = jest.mocked(
  getStaticInfoIncludingLayouts
)

describe('createEntrypoints', () => {
  it('returns entries sorted by key regardless of the order pages resolve in', async () => {
    const pageNames = ['/a', '/b', '/edge-a', '/edge-b']
    // Resolve the static info in reverse alphabetical order so the entries
    // are added in the opposite order of how they should be returned.
    mockedGetStaticInfoIncludingLayouts.mockImplementation(
      ({ page }) =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                runtime: page.startsWith('/edge-') ? 'edge' : 'nodejs',
              } as PageStaticInfo),
            (pageNames.length - pageNames.indexOf(page)) * 10
          )
        )
    )

    const { client, server, edgeServer } = await createEntrypoints({
      config: { experimental: {} } as NextConfigComplete,
      pages: Object.fromEntries(
        pageNames.map((page) => [page, `${PAGES_DIR_ALIAS}${page}.js`])
      ),
      pagesDir: '/project/pages',
      rootDir: '/project',
      isDev: false,
      pageExtensions: ['js'],
    } as unknown as CreateEntrypointsParams)

    expect(Object.keys(client)).toEqual([
      'pages/a',
      'pages/b',
      'pages/edge-a',
      'pages/edge-b',
    ])
    expect(Object.keys(server)).toEqual(['pages/a', 'pages/b'])
    expect(Object.keys(edgeServer)).toEqual(['pages/edge-a', 'pages/edge-b'])
  })
})

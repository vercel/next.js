import { getAppEntry } from './entries'

describe('getAppEntry', () => {
  // #71426: an assetPrefix containing "!" used to truncate the loader request
  // because webpack treats "!" as its inline-loader separator.
  it('escapes "!" in the loader options so the request is not split', () => {
    const { import: request } = getAppEntry({
      name: 'app/page',
      page: '/',
      pagePath: 'private-next-app-dir/page.tsx',
      appDir: '/project/app',
      appPaths: null,
      allNormalizedAppPaths: null,
      preferredRegion: undefined,
      pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
      assetPrefix: 'https://mycdn.com/!mark',
      basePath: '',
      nextConfigOutput: 'export',
      middlewareConfig: '',
    } as any)

    // The final "!" is the intentional loader terminator; everything before it
    // is the loader + query and must contain no raw "!".
    const body = request.slice(0, -1)
    expect(body).not.toContain('!')
    expect(request).toContain('%21')
  })
})

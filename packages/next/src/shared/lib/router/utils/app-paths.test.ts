import {
  compareAppPaths,
  normalizeRscURL,
  selectAppPageEntry,
} from './app-paths'

describe('selectAppPageEntry', () => {
  it('prefers the direct children page over an expanded catch-all slot', () => {
    const appPaths = ['/@slot/[...catchAll]/page', '/foo/page'].sort(
      compareAppPaths
    )

    expect(selectAppPageEntry('/foo', appPaths)).toBe('/foo/page')
  })

  it('prefers the direct children page over a direct parallel slot', () => {
    const appPaths = ['/[...catchAll]/page', '/@slot/[...catchAll]/page'].sort(
      compareAppPaths
    )

    expect(selectAppPageEntry('/[...catchAll]', appPaths)).toBe(
      '/[...catchAll]/page'
    )
  })

  it('prefers the direct children page regardless of input order', () => {
    const appPaths = [
      '/parallel/nested-2/page',
      '/parallel/(new)/@baz/nested-2/page',
    ]

    expect(selectAppPageEntry('/parallel/nested-2', appPaths)).toBe(
      '/parallel/nested-2/page'
    )
    expect(
      selectAppPageEntry('/parallel/nested-2', [...appPaths].reverse())
    ).toBe('/parallel/nested-2/page')
  })

  it('deterministically selects an entry for a slot-only route', () => {
    const appPaths = ['/@alpha/foo/page', '/@beta/foo/page']

    expect(selectAppPageEntry('/foo', appPaths)).toBe('/@beta/foo/page')
    expect(selectAppPageEntry('/foo', [...appPaths].reverse())).toBe(
      '/@beta/foo/page'
    )
  })

  it('matches escaped underscore entries to decoded pathnames', () => {
    expect(selectAppPageEntry('/_shop', ['/%5Fshop/page'])).toBe(
      '/%5Fshop/page'
    )
  })

  it('rejects a route with no direct app path', () => {
    const appPaths = ['/[...catchAll]/page', '/@slot/[...catchAll]/page']

    expect(() => selectAppPageEntry('/unrelated', appPaths)).toThrow(
      'Invariant: no direct app page entry found for /unrelated'
    )
  })
})

describe('compareAppPaths', () => {
  it('sorts parallel slots before the children page', () => {
    expect(
      ['/[...catchAll]/page', '/@slot/[...catchAll]/page'].sort(compareAppPaths)
    ).toEqual(['/@slot/[...catchAll]/page', '/[...catchAll]/page'])
  })
})

describe('normalizeRscPath', () => {
  it('should normalize url with .rsc', () => {
    expect(normalizeRscURL('/test.rsc')).toBe('/test')
  })
  it('should normalize url with .rsc and searchparams', () => {
    expect(normalizeRscURL('/test.rsc?abc=def')).toBe('/test?abc=def')
  })
})

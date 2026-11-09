import { normalizeRscURL, selectAppPageEntry } from './app-paths'

describe('normalizeRscPath', () => {
  it('should normalize url with .rsc', () => {
    expect(normalizeRscURL('/test.rsc')).toBe('/test')
  })
  it('should normalize url with .rsc and searchparams', () => {
    expect(normalizeRscURL('/test.rsc?abc=def')).toBe('/test?abc=def')
  })
})

describe('selectAppPageEntry', () => {
  it.each([
    [
      '/stories/[slug]',
      ['/(group)/stories/[slug]/page', '/@crumbs/stories/[slug]/page'],
      '/(group)/stories/[slug]/page',
    ],
    ['/_escaped', ['/%5Fescaped/page'], '/%5Fescaped/page'],
    [
      '/stories/[slug]',
      [
        '/@b/stories/[slug]/page',
        '/@a/stories/[slug]/page',
        '/[...catchAll]/page',
      ],
      '/@b/stories/[slug]/page',
    ],
  ])(
    'selects the direct entry for %s independently of input order',
    (pathname, entries, expected) => {
      expect(selectAppPageEntry(pathname, entries)).toBe(expected)
      expect(selectAppPageEntry(pathname, [...entries].reverse())).toBe(
        expected
      )
    }
  )

  it('rejects a pathname without a direct entry', () => {
    expect(() =>
      selectAppPageEntry('/missing', ['/[...catchAll]/page'])
    ).toThrow('no direct app page entry')
  })
})

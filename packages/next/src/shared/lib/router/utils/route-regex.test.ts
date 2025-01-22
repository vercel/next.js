import { getNamedRouteRegex } from './route-regex'
import { parseParameter } from './route-regex'

describe('getNamedRouteRegex', () => {
  it('should handle interception markers adjacent to dynamic path segments', () => {
    const regex = getNamedRouteRegex('/photos/(.)[author]/[id]', {
      prefixRouteKeys: true,
    })

    expect(regex.routeKeys).toEqual({
      nxtIauthor: 'nxtIauthor',
      nxtPid: 'nxtPid',
    })

    expect(regex.groups['author']).toEqual({
      pos: 1,
      repeat: false,
      optional: false,
    })

    expect(regex.groups['id']).toEqual({
      pos: 2,
      repeat: false,
      optional: false,
    })

    expect(regex.re.exec('/photos/(.)next/123')).toMatchInlineSnapshot(`
     [
       "/photos/(.)next/123",
       "next",
       "123",
     ]
    `)
  })

  it('should match named routes correctly when interception markers are adjacent to dynamic segments', () => {
    let regex = getNamedRouteRegex('/(.)[author]/[id]', {
      prefixRouteKeys: true,
    })
    let namedRegexp = new RegExp(regex.namedRegex)
    expect(namedRegexp.test('/[author]/[id]')).toBe(false)
    expect(namedRegexp.test('/(.)[author]/[id]')).toBe(true)

    regex = getNamedRouteRegex('/(..)(..)[author]/[id]', {
      prefixRouteKeys: true,
    })
    expect(regex.namedRegex).toMatchInlineSnapshot(
      `"^/\\(\\.\\.\\)\\(\\.\\.\\)(?<nxtIauthor>[^/]+?)/(?<nxtPid>[^/]+?)(?:/)?$"`
    )
    namedRegexp = new RegExp(regex.namedRegex)
    expect(namedRegexp.test('/[author]/[id]')).toBe(false)
    expect(namedRegexp.test('/(..)(..)[author]/[id]')).toBe(true)
  })

  it('should handle multi-level interception markers', () => {
    const regex = getNamedRouteRegex('/photos/(..)(..)[author]/[id]', {
      prefixRouteKeys: true,
    })

    expect(regex.routeKeys).toEqual({
      nxtIauthor: 'nxtIauthor',
      nxtPid: 'nxtPid',
    })

    expect(regex.groups['author']).toEqual({
      pos: 1,
      repeat: false,
      optional: false,
    })

    expect(regex.groups['id']).toEqual({
      pos: 2,
      repeat: false,
      optional: false,
    })

    expect(regex.re.source).toMatchInlineSnapshot(
      `"^\\/photos\\/\\(\\.\\.\\)\\(\\.\\.\\)([^/]+?)\\/([^/]+?)(?:\\/)?$"`
    )

    expect(regex.re.exec('/photos/(..)(..)next/123')).toMatchInlineSnapshot(`
     [
       "/photos/(..)(..)next/123",
       "next",
       "123",
     ]
    `)
  })

  it('should not remove extra parts beside the param segments', () => {
    const { re, namedRegex, routeKeys } = getNamedRouteRegex(
      '/[locale]/about.segments/[...segmentPath].segment.rsc',
      {
        prefixRouteKeys: true,
        includeSuffix: true,
      }
    )
    expect(routeKeys).toEqual({
      nxtPlocale: 'nxtPlocale',
      nxtPsegmentPath: 'nxtPsegmentPath',
    })
    expect(namedRegex).toMatchInlineSnapshot(
      `"^/(?<nxtPlocale>[^/]+?)/about\\.segments/(?<nxtPsegmentPath>.+?)\\.segment\\.rsc(?:/)?$"`
    )
    expect(re.source).toMatchInlineSnapshot(
      `"^\\/([^/]+?)\\/about\\.segments\\/(.+?)\\.segment\\.rsc(?:\\/)?$"`
    )
  })

  it('should not remove extra parts in front of the param segments', () => {
    const { re, namedRegex, routeKeys } = getNamedRouteRegex(
      '/[locale]/about.segments/$dname$d[name].segment.rsc',
      {
        prefixRouteKeys: true,
        includeSuffix: true,
        includePrefix: true,
      }
    )
    expect(routeKeys).toEqual({
      nxtPlocale: 'nxtPlocale',
      nxtPname: 'nxtPname',
    })
    expect(namedRegex).toEqual(
      '^/(?<nxtPlocale>[^/]+?)/about\\.segments/\\$dname\\$d(?<nxtPname>[^/]+?)\\.segment\\.rsc(?:/)?$'
    )
    expect(re.source).toEqual(
      '^\\/([^/]+?)\\/about\\.segments\\/\\$dname\\$d([^/]+?)\\.segment\\.rsc(?:\\/)?$'
    )

    expect('/en/about.segments/$dname$dwyatt.segment.rsc'.match(re))
      .toMatchInlineSnapshot(`
     [
       "/en/about.segments/$dname$dwyatt.segment.rsc",
       "en",
       "wyatt",
     ]
    `)
  })

  it('should handle interception markers not adjacent to dynamic path segments', () => {
    const regex = getNamedRouteRegex('/photos/(.)author/[id]', {
      prefixRouteKeys: true,
    })

    expect(regex.namedRegex).toMatchInlineSnapshot(
      `"^/photos/\\(\\.\\)author/(?<nxtPid>[^/]+?)(?:/)?$"`
    )

    expect(regex.routeKeys).toEqual({
      nxtPid: 'nxtPid',
    })

    expect(regex.groups['author']).toBeUndefined()

    expect(regex.groups['id']).toEqual({
      pos: 1,
      repeat: false,
      optional: false,
    })

    expect(regex.re.exec('/photos/(.)author/123')).toMatchInlineSnapshot(`
     [
       "/photos/(.)author/123",
       "123",
     ]
    `)
  })

  it('should handle optional dynamic path segments', () => {
    const regex = getNamedRouteRegex('/photos/[[id]]', {
      prefixRouteKeys: true,
    })

    expect(regex.routeKeys).toEqual({
      nxtPid: 'nxtPid',
    })

    expect(regex.groups['id']).toEqual({
      pos: 1,
      repeat: false,
      optional: true,
    })
  })

  it('should handle optional catch-all dynamic path segments', () => {
    const regex = getNamedRouteRegex('/photos/[[...id]]', {
      prefixRouteKeys: true,
    })

    expect(regex.routeKeys).toEqual({
      nxtPid: 'nxtPid',
    })

    expect(regex.groups['id']).toEqual({
      pos: 1,
      repeat: true,
      optional: true,
    })

    expect(regex.re.exec('/photos/1')).toMatchInlineSnapshot(`
     [
       "/photos/1",
       "1",
     ]
    `)
    expect(regex.re.exec('/photos/1/2/3')).toMatchInlineSnapshot(`
     [
       "/photos/1/2/3",
       "1/2/3",
     ]
    `)
    expect(regex.re.exec('/photos')).toMatchInlineSnapshot(`
     [
       "/photos",
       undefined,
     ]
    `)
  })
})

describe('parseParameter', () => {
  it('should parse a optional catchall parameter', () => {
    const param = '[[...slug]]'
    const expected = { key: 'slug', repeat: true, optional: true }
    const result = parseParameter(param)
    expect(result).toEqual(expected)
  })

  it('should parse a catchall parameter', () => {
    const param = '[...slug]'
    const expected = { key: 'slug', repeat: true, optional: false }
    const result = parseParameter(param)
    expect(result).toEqual(expected)
  })

  it('should parse a optional parameter', () => {
    const param = '[[foo]]'
    const expected = { key: 'foo', repeat: false, optional: true }
    const result = parseParameter(param)
    expect(result).toEqual(expected)
  })

  it('should parse a dynamic parameter', () => {
    const param = '[bar]'
    const expected = { key: 'bar', repeat: false, optional: false }
    const result = parseParameter(param)
    expect(result).toEqual(expected)
  })

  it('should parse non-dynamic parameter', () => {
    const param = 'fizz'
    const expected = { key: 'fizz', repeat: false, optional: false }
    const result = parseParameter(param)
    expect(result).toEqual(expected)
  })
})

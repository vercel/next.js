import { getNamedRouteRegex } from './route-regex'
import { parseParameter } from './route-regex'

describe('getNamedRouteRegex', () => {
  it('should handle interception markers adjacent to dynamic path segments', () => {
    const regex = getNamedRouteRegex('/photos/(.)[author]/[id]', true)

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

    expect(regex.re.test('/photos/(.)next/123')).toBe(true)
  })

  it('should match named routes correctly when interception markers are adjacent to dynamic segments', () => {
    let regex = getNamedRouteRegex('/(.)[author]/[id]', true)
    let namedRegexp = new RegExp(regex.namedRegex)
    expect(namedRegexp.test('/[author]/[id]')).toBe(false)
    expect(namedRegexp.test('/(.)[author]/[id]')).toBe(true)

    regex = getNamedRouteRegex('/(..)(..)[author]/[id]', true)
    namedRegexp = new RegExp(regex.namedRegex)
    expect(namedRegexp.test('/[author]/[id]')).toBe(false)
    expect(namedRegexp.test('/(..)(..)[author]/[id]')).toBe(true)
  })

  it('should handle multi-level interception markers', () => {
    const regex = getNamedRouteRegex('/photos/(..)(..)[author]/[id]', true)

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

    expect(regex.re.test('/photos/(..)(..)next/123')).toBe(true)
  })

  it('should handle interception markers not adjacent to dynamic path segments', () => {
    const regex = getNamedRouteRegex('/photos/(.)author/[id]', true)

    expect(regex.routeKeys).toEqual({
      nxtPid: 'nxtPid',
    })

    expect(regex.groups['author']).toBeUndefined()

    expect(regex.groups['id']).toEqual({
      pos: 1,
      repeat: false,
      optional: false,
    })

    expect(regex.re.test('/photos/(.)author/123')).toBe(true)
  })

  it('should handle optional dynamic path segments', () => {
    const regex = getNamedRouteRegex('/photos/[[id]]', true)

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
    const regex = getNamedRouteRegex('/photos/[[...id]]', true)

    expect(regex.routeKeys).toEqual({
      nxtPid: 'nxtPid',
    })

    expect(regex.groups['id']).toEqual({
      pos: 1,
      repeat: true,
      optional: true,
    })

    expect(regex.re.test('/photos/1')).toBe(true)
    expect(regex.re.test('/photos/1/2/3')).toBe(true)
    expect(regex.re.test('/photos')).toBe(true)
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

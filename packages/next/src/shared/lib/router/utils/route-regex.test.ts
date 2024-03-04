import { getNamedRouteRegex } from './route-regex'

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

import { getRouteRegex } from './route-regex'

describe('getRouteRegex', () => {
  it('should handle interception markers adjacent to dynamic path segments', () => {
    const regex = getRouteRegex('/photos/(.)[author]/[id]')
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

  it('should handle multi-level interception markers', () => {
    const regex = getRouteRegex('/photos/(..)(..)[author]/[id]')
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
    const regex = getRouteRegex('/photos/(.)author/[id]')

    expect(regex.groups['author']).toBeUndefined()
    expect(regex.groups['id']).toEqual({
      pos: 1,
      repeat: false,
      optional: false,
    })

    expect(regex.re.test('/photos/(.)author/123')).toBe(true)
  })

  it('should handle optional dynamic path segments', () => {
    const regex = getRouteRegex('/photos/[[id]]')

    expect(regex.groups['id']).toEqual({
      pos: 1,
      repeat: false,
      optional: true,
    })
  })

  it('should handle optional catch-all dynamic path segments', () => {
    const regex = getRouteRegex('/photos/[[...id]]')

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

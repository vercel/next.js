import { routeDefinitionSorter } from './route-definition-sorter'

describe('routeDefinitionSorter', () => {
  const extensions = ['ts', 'jsx', 'tsx']

  test('should sort by pathname', () => {
    const a = { pathname: 'a', page: 'a', filename: 'a' }
    const b = { pathname: 'b', page: 'a', filename: 'a' }
    expect(routeDefinitionSorter(a, b, extensions)).toBe(-1)
  })

  test('should sort by page when pathname is the same', () => {
    const a = { pathname: 'a', page: 'a', filename: 'a' }
    const b = { pathname: 'a', page: 'b', filename: 'a' }
    expect(routeDefinitionSorter(a, b, extensions)).toBe(-1)
  })

  test('should sort by filename when pathname and page are the same', () => {
    const a = { pathname: 'a', page: 'a', filename: 'a.ts' }
    const b = { pathname: 'a', page: 'a', filename: 'b.tsx' }
    expect(routeDefinitionSorter(a, b, extensions)).toBe(-1)
  })

  test('should sort by extension when pathname, page and filename are the same', () => {
    const a = { pathname: 'a', page: 'a', filename: 'file.tsx' }
    const b = { pathname: 'a', page: 'a', filename: 'file.ts' }

    let arr = [a, b]
    arr.sort((l, r) => routeDefinitionSorter(l, r, extensions))
    expect(arr).toEqual([b, a])

    expect(routeDefinitionSorter(a, b, extensions)).toBe(2)
  })

  test('should sort by extension order from the extensions array', () => {
    const a = {
      pathname: 'a',
      page: 'a',
      filename: 'file.jsx',
    }
    const b = { pathname: 'a', page: 'a', filename: 'file.ts' }
    expect(routeDefinitionSorter(a, b, extensions)).toBe(1)
  })
})

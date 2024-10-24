/* eslint-env jest */
import { asPathToSearchParams } from 'next/dist/shared/lib/router/utils/as-path-to-search-params'

describe('asPathToSearchParams', () => {
  // Convenience function so tests can be aligned neatly
  // and easy to eyeball
  const check = (asPath: string, queries: string) => {
    const searchParams = asPathToSearchParams(asPath)
    const correctSearchParams = new URLSearchParams(queries)

    Array.from(correctSearchParams.keys()).forEach((key) => {
      expect(searchParams.has(key)).toBe(true)
      expect(searchParams.get(key)).toStrictEqual(correctSearchParams.get(key))
    })
  }

  it('should get valid root relative path', () => {
    check('/', '')
  })

  it('should get converted valid root relative path from invalid URL', () => {
    check('//', '')
  })

  it('should get valid relative path', () => {
    check(
      '/pathA/pathB?fooC=barD&fooE=barF&fooE=barG#hashH',
      'fooC=barD&fooE=barF&fooE=barG'
    )
  })

  it('should get converted valid relative path from invalid URL', () => {
    check(
      '//pathA/pathB?fooC=barD&fooE=barF&fooE=barG#hashH',
      'fooC=barD&fooE=barF&fooE=barG'
    )
  })
})

/* eslint-env jest */
import resolveRewrites from 'next/dist/shared/lib/router/utils/resolve-rewrites'
import { removeTrailingSlash } from 'next/dist/shared/lib/router/utils/remove-trailing-slash'

describe('resolveRewrites', () => {
  it('does not match if there is no matching rewrite', () => {
    const result = resolveRewrites(
      '/default/test1/',
      ['/part1/part2'],
      {
        beforeFiles: [],
        afterFiles: [],
        fallback: [
          {
            source: '/:nextInternalLocale(default)/test2',
            destination: '/:nextInternalLocale/part1/part2',
          },
        ],
      },
      {},
      (pathname: string) => {
        return removeTrailingSlash(pathname)
      },
      ['default']
    )

    expect(result.matchedPage).toBe(false)
  })

  describe('trailingSlash true', () => {
    it('should match rewrites that do not end in a trailing slash', () => {
      const result = resolveRewrites(
        '/default/test1/',
        ['/part1/part2'],
        {
          beforeFiles: [],
          afterFiles: [],
          fallback: [
            {
              source: '/:nextInternalLocale(default)/test1',
              destination: '/:nextInternalLocale/part1/part2',
            },
          ],
        },
        {},
        (pathname: string) => {
          return removeTrailingSlash(pathname)
        },
        ['default']
      )

      expect(result.matchedPage).toBe(true)
    })

    it('should match rewrites that end in a trailing slash', () => {
      const result = resolveRewrites(
        '/default/test1/',
        ['/part1/part2'],
        {
          beforeFiles: [],
          afterFiles: [],
          fallback: [
            {
              source: '/:nextInternalLocale(default)/test1/',
              destination: '/:nextInternalLocale/part1/part2/',
            },
          ],
        },
        {},
        (pathname: string) => {
          return removeTrailingSlash(pathname)
        },
        ['default']
      )

      expect(result.matchedPage).toBe(true)
    })
  })

  describe('trailingSlash false', () => {
    it('should match rewrites that do not end in a trailing slash', () => {
      const result = resolveRewrites(
        '/default/test1',
        ['/part1/part2'],
        {
          beforeFiles: [],
          afterFiles: [],
          fallback: [
            {
              source: '/:nextInternalLocale(default)/test1',
              destination: '/:nextInternalLocale/part1/part2',
            },
          ],
        },
        {},
        (pathname: string) => {
          return removeTrailingSlash(pathname)
        },
        ['default']
      )

      expect(result.matchedPage).toBe(true)
    })

    it('should match rewrites that end in a trailing slash', () => {
      const result = resolveRewrites(
        '/default/test1',
        ['/part1/part2'],
        {
          beforeFiles: [],
          afterFiles: [],
          fallback: [
            {
              source: '/:nextInternalLocale(default)/test1/',
              destination: '/:nextInternalLocale/part1/part2/',
            },
          ],
        },
        {},
        (pathname: string) => {
          return removeTrailingSlash(pathname)
        },
        ['default']
      )

      expect(result.matchedPage).toBe(true)
    })
  })
})

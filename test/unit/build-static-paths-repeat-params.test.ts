/* eslint-env jest */

import { buildPagesStaticPaths } from 'next/dist/build/static-paths/pages'
import { assertRepeatParamSegmentsAreStrings } from 'next/dist/build/static-paths/utils'

describe('assertRepeatParamSegmentsAreStrings', () => {
  it('does not throw for string[]', () => {
    expect(() =>
      assertRepeatParamSegmentsAreStrings(
        'slug',
        ['a', 'b'],
        '/x',
        'getStaticPaths'
      )
    ).not.toThrow()
  })

  it('throws a descriptive error when a segment is not a string', () => {
    expect(() =>
      assertRepeatParamSegmentsAreStrings(
        'slug',
        ['a', 2 as any],
        '/[...slug]',
        'getStaticPaths'
      )
    ).toThrow(
      'A required parameter (slug) was provided as an array, but each segment must be a string. Received number at index 1 in getStaticPaths for /[...slug]'
    )
  })
})

describe('buildPagesStaticPaths (repeat params)', () => {
  it('rejects non-string segments in catch-all params from getStaticPaths', async () => {
    await expect(
      buildPagesStaticPaths({
        page: '/[...slug]',
        configFileName: 'next.config.js',
        getStaticPaths: async () => ({
          paths: [{ params: { slug: [1, 2] as any } }],
          fallback: false,
        }),
      })
    ).rejects.toThrow(
      'A required parameter (slug) was provided as an array, but each segment must be a string. Received number at index 0 in getStaticPaths for /[...slug]'
    )
  })
})

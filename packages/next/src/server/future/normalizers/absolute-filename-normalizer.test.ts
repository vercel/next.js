import { PAGE_TYPES } from '../../../lib/page-types'
import { AbsoluteFilenameNormalizer } from './absolute-filename-normalizer'

describe('AbsoluteFilenameNormalizer', () => {
  it.each([
    {
      name: PAGE_TYPES.APP,
      pathname: '<root>/app/basic/(grouped)/endpoint/nested/route.ts',
      expected: '/basic/(grouped)/endpoint/nested/route',
    },
    {
      name: PAGE_TYPES.PAGES,
      pathname: '<root>/pages/basic/endpoint/nested.ts',
      expected: '/basic/endpoint/nested',
    },
    {
      name: PAGE_TYPES.PAGES,
      pathname: '<root>/pages/basic/endpoint/index.ts',
      expected: '/basic/endpoint',
    },
  ])(
    "normalizes '$pathname' to '$expected'",
    ({ pathname, expected, name }) => {
      const normalizer = new AbsoluteFilenameNormalizer(
        `<root>/${name}`,
        ['ts', 'tsx', 'js', 'jsx'],
        name as PAGE_TYPES
      )

      expect(normalizer.normalize(pathname)).toEqual(expected)
    }
  )
})

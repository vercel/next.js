import { AbsoluteFilenameNormalizer } from './absolute-filename-normalizer'

describe('AbsoluteFilenameNormalizer', () => {
  it.each([
    {
      name: 'app',
      pathname: '<root>/app/basic/(grouped)/endpoint/nested/route.ts',
      expected: '/basic/(grouped)/endpoint/nested/route',
    },
    {
      name: 'pages',
      pathname: '<root>/pages/basic/endpoint/nested.ts',
      expected: '/basic/endpoint/nested',
    },
    {
      name: 'pages',
      pathname: '<root>/pages/basic/endpoint/index.ts',
      expected: '/basic/endpoint',
    },
  ])(
    "normalizes '$pathname' to '$expected'",
    ({ pathname, expected, name }) => {
      const normalizer = new AbsoluteFilenameNormalizer(
        `<root>/${name}`,
        ['ts', 'tsx', 'js', 'jsx'],
        name as 'app' | 'pages' | 'root'
      )

      expect(normalizer.normalize(pathname)).toEqual(expected)
    }
  )
})

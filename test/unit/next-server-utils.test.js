/* eslint-env jest */
import { cleanAmpPath } from 'next/dist/next-server/server/utils'

// convenince function so tests can be alligned neatly
// and easy to eyeball
const check = (input, expected) =>
  expect(cleanAmpPath(input)).toBe(expected)

describe('cleanAmpPath', () => {
  it('should leave url unchanged when no apm parameter is present', () =>
    check(
      '/some/path?param=blah',
      '/some/path?param=blah'
    )
  )

  it('should handle amp as the only parameter', () =>
    check(
      '/some/path?amp=1',
      '/some/path'
    )
  )

  it('should handle amp as the first parameter', () =>
    check(
      '/some/path?amp=1&page=10',
      '/some/path?page=10'
    )
  )

  it('should handle amp as the middle parameter', () =>
    check(
      '/some/path?page=10&amp=1&last=here',
      '/some/path?page=10&last=here'
    )
  )

  it('should handle amp as the last parameter', () =>
    check(
      '/some/path?page=10&amp=1',
      '/some/path?page=10'
    )
  )
})

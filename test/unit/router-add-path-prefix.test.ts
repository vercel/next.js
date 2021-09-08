/* eslint-env jest */
import { addPathPrefix } from 'next/dist/shared/lib/router/router'

describe('router addPathPrefix', () => {
  it('should return path with trailing slash and hash', () => {
    process.env.__NEXT_TRAILING_SLASH = 'true'
    const result = addPathPrefix('/#hello', '/foo')
    expect(result).toBe('/foo/#hello')
  })

  it('should return path with no trailing slash and hash', () => {
    process.env.__NEXT_TRAILING_SLASH = ''
    const result = addPathPrefix('/#hello', '/foo')
    expect(result).toBe('/foo#hello')
  })
})

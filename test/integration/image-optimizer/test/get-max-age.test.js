/* eslint-env jest */
import { getMaxAge } from '../../../../packages/next/dist/next-server/server/image-optimizer.js'

describe('getMaxAge', () => {
  it('should return default when no cache-control provided', () => {
    expect(getMaxAge()).toBe(60)
  })
  it('should return default when cache-control is null', () => {
    expect(getMaxAge(null)).toBe(60)
  })
  it('should return default when cache-control is empty string', () => {
    expect(getMaxAge('')).toBe(60)
  })
  it('should return default when cache-control max-age is less than default', () => {
    expect(getMaxAge('max-age=30')).toBe(60)
  })
  it('should return default when cache-control is no-cache', () => {
    expect(getMaxAge('no-cache')).toBe(60)
  })
  it('should return cache-control max-age', () => {
    expect(getMaxAge('max-age=9999')).toBe(9999)
  })
  it('should return cache-control s-maxage', () => {
    expect(getMaxAge('s-maxage=9999')).toBe(9999)
  })
  it('should return cache-control s-maxage even when max-age is defined', () => {
    expect(getMaxAge('public, max-age=5555, s-maxage=9999')).toBe(9999)
  })
})

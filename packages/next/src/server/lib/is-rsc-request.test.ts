import { isRSCRequestHeader } from './is-rsc-request'

describe('isRSCRequestHeader', () => {
  it('returns true for the canonical RSC header value', () => {
    expect(isRSCRequestHeader('1')).toBe(true)
  })

  it('returns false for invalid or missing values', () => {
    expect(isRSCRequestHeader('0')).toBe(false)
    expect(isRSCRequestHeader(undefined)).toBe(false)
    expect(isRSCRequestHeader(null)).toBe(false)
  })

  it('returns false for repeated header values', () => {
    expect(isRSCRequestHeader(['1'])).toBe(false)
    expect(isRSCRequestHeader(['1', '1'])).toBe(false)
  })
})

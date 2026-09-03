import {
  getForwardedProto,
  getForwardedProtocol,
} from 'next/src/server/lib/normalize-forwarded-headers'

describe('getForwardedProto', () => {
  it('returns undefined when header is missing', () => {
    expect(getForwardedProto({})).toBeUndefined()
  })

  it('returns the protocol for a single value', () => {
    expect(getForwardedProto({ 'x-forwarded-proto': 'https' })).toBe('https')
    expect(getForwardedProto({ 'x-forwarded-proto': 'http' })).toBe('http')
  })

  it('returns the first value when comma-separated (multiple proxies)', () => {
    expect(
      getForwardedProto({ 'x-forwarded-proto': 'https, https' })
    ).toBe('https')
    expect(
      getForwardedProto({ 'x-forwarded-proto': 'https, http' })
    ).toBe('https')
    expect(
      getForwardedProto({ 'x-forwarded-proto': 'http, https' })
    ).toBe('http')
  })

  it('handles array form (multiple headers with same name)', () => {
    expect(
      getForwardedProto({ 'x-forwarded-proto': ['https', 'http'] })
    ).toBe('https')
  })

  it('trims whitespace', () => {
    expect(
      getForwardedProto({ 'x-forwarded-proto': ' https , http ' })
    ).toBe('https')
  })
})

describe('getForwardedProtocol', () => {
  it('returns https when socket is encrypted', () => {
    expect(getForwardedProtocol({}, true)).toBe('https')
  })

  it('returns https when x-forwarded-proto is https', () => {
    expect(
      getForwardedProtocol({ 'x-forwarded-proto': 'https' })
    ).toBe('https')
  })

  it('returns http when x-forwarded-proto is missing', () => {
    expect(getForwardedProtocol({})).toBe('http')
  })

  it('returns https when x-forwarded-proto has duplicated https values', () => {
    expect(
      getForwardedProtocol({ 'x-forwarded-proto': 'https, https' })
    ).toBe('https')
  })

  it('returns http when first value is http even if second is https', () => {
    expect(
      getForwardedProtocol({ 'x-forwarded-proto': 'http, https' })
    ).toBe('http')
  })

  it('prefers encrypted socket over header', () => {
    expect(
      getForwardedProtocol({ 'x-forwarded-proto': 'http' }, true)
    ).toBe('https')
  })
})

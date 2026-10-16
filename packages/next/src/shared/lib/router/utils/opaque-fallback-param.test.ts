import {
  createOpaqueFallbackParamValue,
  isOpaqueFallbackParamKey,
} from './opaque-fallback-param'

describe('opaque fallback params', () => {
  it('recognizes created placeholders', () => {
    const value = createOpaqueFallbackParamValue('itemId', 'abc123')
    expect(value).toBe('%%drp:itemId:abc123%%')
    expect(isOpaqueFallbackParamKey(value)).toBe(true)
  })

  it('does not recognize concrete param keys', () => {
    for (const value of [
      'expected-id',
      '%%drp:itemId:abc123%%',
      '50%',
      'a/b',
      '%%drp',
    ]) {
      // Concrete keys are encoded with encodeURIComponent on the server.
      expect(isOpaqueFallbackParamKey(encodeURIComponent(value))).toBe(false)
    }
    expect(isOpaqueFallbackParamKey('')).toBe(false)
  })
})

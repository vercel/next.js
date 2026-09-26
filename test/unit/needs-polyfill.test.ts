/* eslint-env jest */
import { needsPolyfill } from '../../packages/next/src/build/polyfills/needs-polyfill'

describe('needsPolyfill', () => {
  it('should return false for modern browsers that support all polyfilled APIs', () => {
    expect(
      needsPolyfill([
        'chrome 131',
        'firefox 133',
        'safari 18.2',
        'edge 131',
        'opera 106',
        'samsung 25',
        'ios_saf 18',
        'and_chr 131',
      ])
    ).toBe(false)
  })

  it('should recognize Opera and Samsung Internet', () => {
    expect(needsPolyfill(['opera 110', 'samsung 25'])).toBe(false)
    expect(needsPolyfill(['opera 70'])).toBe(true)
    expect(needsPolyfill(['samsung 15'])).toBe(true)
  })

  it('should recognize derivative browsers (Brave, Arc, Zen, Vivaldi)', () => {
    expect(needsPolyfill(['brave 125', 'arc 125', 'zen 125'])).toBe(false)
    expect(needsPolyfill(['zen 100'])).toBe(true)
    expect(needsPolyfill(['brave 60'])).toBe(true)
  })

  it('should return false for browsers that meet the minimum version for all polyfilled APIs', () => {
    expect(
      needsPolyfill([
        'chrome 120',
        'firefox 115',
        'safari 17',
        'edge 120',
        'opera 106',
        'samsung 25',
      ])
    ).toBe(false)
  })

  it('should return true for Chrome 119 (missing url.canparse)', () => {
    expect(
      needsPolyfill(['chrome 119', 'firefox 115', 'safari 17', 'edge 120'])
    ).toBe(true)
  })

  it('should return true for Chrome 65 (missing trimStart/trimEnd)', () => {
    expect(needsPolyfill(['chrome 65'])).toBe(true)
  })

  it('should return true for Firefox 60 (missing trimStart/trimEnd)', () => {
    expect(needsPolyfill(['firefox 60'])).toBe(true)
  })

  it('should return true for Safari 11 (missing trimStart/trimEnd)', () => {
    expect(needsPolyfill(['safari 11'])).toBe(true)
  })

  it('should return true for Chrome 91 (missing Array.at)', () => {
    expect(needsPolyfill(['chrome 91'])).toBe(true)
  })

  it('should return true for Chrome 92 (missing Object.hasOwn and url.canparse)', () => {
    expect(needsPolyfill(['chrome 92'])).toBe(true)
  })

  it('should return true for legacy IE 11', () => {
    expect(needsPolyfill(['ie 11'])).toBe(true)
  })

  it('should return true for empty or undefined browserslist', () => {
    expect(needsPolyfill([])).toBe(true)
    expect(needsPolyfill(undefined)).toBe(true)
  })
})

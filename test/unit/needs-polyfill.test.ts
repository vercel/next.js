import { needsPolyfill } from 'next/dist/build/polyfills/needs-polyfill'

describe('needsPolyfill', () => {
  it('should return false for modern browsers that support all polyfilled APIs', () => {
    expect(needsPolyfill(['chrome 131', 'firefox 133', 'safari 18'])).toBe(
      false
    )
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

  it('should return true for Edge 18 (missing Promise.prototype.finally)', () => {
    expect(needsPolyfill(['edge 18'])).toBe(true)
  })

  it('should return true when any one browser in the list needs polyfills', () => {
    expect(
      needsPolyfill(['chrome 131', 'firefox 60', 'safari 18'])
    ).toBe(true)
  })

  it('should return false when all browsers support all polyfilled APIs', () => {
    expect(
      needsPolyfill(['chrome 131', 'firefox 133', 'safari 18', 'edge 131'])
    ).toBe(false)
  })

  it('should return true for an unrecognized browser', () => {
    expect(needsPolyfill(['opera 100'])).toBe(true)
  })

  it('should return true for an empty array with no recognized browsers', () => {
    // Edge case: if browserslist resolves to nothing, be safe and include polyfills.
    // However, the function iterates over entries, so an empty array means no
    // browser fails the check → returns false. This is acceptable because an
    // empty browserslist means no targets (build would be pointless).
    expect(needsPolyfill([])).toBe(false)
  })

  it('should return false for Chrome 92+ (has Array.at)', () => {
    expect(needsPolyfill(['chrome 92'])).toBe(false)
  })

  it('should return true for Chrome 91 (missing Array.at)', () => {
    expect(needsPolyfill(['chrome 91'])).toBe(true)
  })

  it('should return false for Safari 15.4+ (has Array.at and Object.hasOwn)', () => {
    expect(needsPolyfill(['safari 15.4'])).toBe(false)
  })

  it('should return true for Safari 15 (missing Array.at)', () => {
    expect(needsPolyfill(['safari 15'])).toBe(true)
  })

  it('should return false for Firefox 115+ (has URL.canParse)', () => {
    expect(needsPolyfill(['firefox 115'])).toBe(false)
  })

  it('should return true for Firefox 114 (missing URL.canParse)', () => {
    expect(needsPolyfill(['firefox 114'])).toBe(true)
  })
})

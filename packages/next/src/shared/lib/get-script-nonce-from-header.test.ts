import { getScriptNonceFromHeader } from '../../server/app-render/get-script-nonce-from-header'

describe('getScriptNonceFromHeader', () => {
  it('extracts nonce from script-src', () => {
    const h = "script-src 'self' 'nonce-abc123'; object-src 'none'"
    expect(getScriptNonceFromHeader(h)).toBe('abc123')
  })

  it('does not confuse script-src-attr/elem with script-src', () => {
    const h =
      "script-src-attr 'none'; script-src-elem https:; script-src 'nonce-wowWOW123' 'self'"
    expect(getScriptNonceFromHeader(h)).toBe('wowWOW123')
  })

  it('falls back to default-src when script-src absent', () => {
    const h = "default-src 'nonce-zzz999' 'self'; img-src *"
    expect(getScriptNonceFromHeader(h)).toBe('zzz999')
  })

  it('handles arbitrary whitespace', () => {
    const h = "script-src\t\t'nonce-abc'\t   'self'   https:"
    expect(getScriptNonceFromHeader(h)).toBe('abc')
  })

  it('matches directive names case-insensitively', () => {
    const h = "Script-Src 'nonce-UPCASE'"
    expect(getScriptNonceFromHeader(h)).toBe('UPCASE')
  })

  it('returns undefined when no nonce present', () => {
    const h = "script-src 'self' https:"
    expect(getScriptNonceFromHeader(h)).toBeUndefined()
  })

  it('rejects nonce values with HTML escape characters', () => {
    const h = "script-src 'nonce-a&lt;b' 'self'"
    expect(() => getScriptNonceFromHeader(h)).toThrow(
      /Nonce value from Content-Security-Policy contained HTML escape characters/
    )
  })
})

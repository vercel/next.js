import {
  getScriptNonceFromHeader,
  getScriptNonceFromHeaders,
} from './get-script-nonce-from-header'

describe('getScriptNonceFromHeader', () => {
  it('returns the first valid nonce from the script-src directive', () => {
    expect(
      getScriptNonceFromHeader(
        `default-src 'nonce-other'; script-src 'nonce-cmFuZG9tCg=='`
      )
    ).toBe('cmFuZG9tCg==')
  })

  it('ignores malformed nonce values', () => {
    expect(
      getScriptNonceFromHeader(`script-src 'nonce-"><script></script>"'`)
    ).toBeUndefined()
    expect(
      getScriptNonceFromHeader(`script-src 'nonce-" onerror="alert(1)'`)
    ).toBeUndefined()
  })

  it('skips malformed nonce values and keeps looking for a valid one', () => {
    expect(
      getScriptNonceFromHeader(
        `script-src 'nonce-" onerror="alert(1)' 'nonce-cmFuZG9tCg=='`
      )
    ).toBe('cmFuZG9tCg==')
  })
})

describe('getScriptNonceFromHeaders', () => {
  it('returns the nonce from the Content-Security-Policy header', () => {
    expect(
      getScriptNonceFromHeaders({
        'content-security-policy': `script-src 'nonce-cmFuZG9tCg=='`,
      })
    ).toBe('cmFuZG9tCg==')
  })

  it('falls back to the Content-Security-Policy-Report-Only header', () => {
    expect(
      getScriptNonceFromHeaders({
        'content-security-policy-report-only': `script-src 'nonce-cmVwb3J0'`,
      })
    ).toBe('cmVwb3J0')
  })

  it('prefers the Content-Security-Policy header over the report-only one', () => {
    expect(
      getScriptNonceFromHeaders({
        'content-security-policy': `script-src 'nonce-ZW5mb3JjZWQ='`,
        'content-security-policy-report-only': `script-src 'nonce-cmVwb3J0'`,
      })
    ).toBe('ZW5mb3JjZWQ=')
  })

  it('returns undefined without a CSP header', () => {
    expect(getScriptNonceFromHeaders({})).toBeUndefined()
  })

  it('ignores non-string header values', () => {
    expect(
      getScriptNonceFromHeaders({
        'content-security-policy': [
          `script-src 'nonce-cmFuZG9tCg=='`,
        ] as unknown as string,
      })
    ).toBeUndefined()
  })
})

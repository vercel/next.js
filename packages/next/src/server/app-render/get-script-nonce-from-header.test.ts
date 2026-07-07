import { getScriptNonceFromHeader } from './get-script-nonce-from-header'

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

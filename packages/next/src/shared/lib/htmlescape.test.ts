import { htmlEscapeAttributeString, htmlEscapeJsonString } from './htmlescape'

describe('htmlEscapeJsonString', () => {
  it('returns strings without HTML-sensitive characters unchanged', () => {
    expect(htmlEscapeJsonString('plain JSON data / 😀')).toBe(
      'plain JSON data / 😀'
    )
  })

  it('escapes every HTML-sensitive character', () => {
    expect(htmlEscapeJsonString('&><\u2028\u2029')).toBe(
      '\\u0026\\u003e\\u003c\\u2028\\u2029'
    )
  })

  it('escapes sparse matches at the start, middle, and end', () => {
    expect(htmlEscapeJsonString(`<${'a'.repeat(64)}&${'b'.repeat(64)}>`)).toBe(
      `\\u003c${'a'.repeat(64)}\\u0026${'b'.repeat(64)}\\u003e`
    )
  })

  it('preserves malformed surrogate code units', () => {
    expect(htmlEscapeJsonString('\ud800safe\udfff')).toBe('\ud800safe\udfff')
  })

  it('preserves behavior at and above the fast-path size boundary', () => {
    const atBoundary = `${'a'.repeat(1024 * 1024 - 1)}<`
    const aboveBoundary = `${'a'.repeat(1024 * 1024)}&`

    expect(htmlEscapeJsonString(atBoundary)).toBe(
      `${'a'.repeat(1024 * 1024 - 1)}\\u003c`
    )
    expect(htmlEscapeJsonString(aboveBoundary)).toBe(
      `${'a'.repeat(1024 * 1024)}\\u0026`
    )
  })
})

describe('htmlEscapeAttributeString', () => {
  it('continues to escape HTML attributes', () => {
    expect(htmlEscapeAttributeString(`&"'<>`)).toBe('&amp;&quot;&#39;&lt;&gt;')
  })
})

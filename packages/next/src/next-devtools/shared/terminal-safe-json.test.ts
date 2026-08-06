import {
  escapeTerminalText,
  getTerminalSafeJsonByteLength,
  getUtf8ByteLength,
  stringifyTerminalSafeJson,
} from './terminal-safe-json'

describe('terminal-safe JSON', () => {
  it('escapes C0, C1, line, and bidirectional formatting controls', () => {
    const unsafe = '\u001b\u0085\u061c\u200e\u2028\u202e\u2067'
    const escaped = escapeTerminalText(unsafe)

    expect(escaped).toBe('\\u001b\\u0085\\u061c\\u200e\\u2028\\u202e\\u2067')
    expect(stringifyTerminalSafeJson({ unsafe })).toBe(
      '{"unsafe":"\\u001b\\u0085\\u061c\\u200e\\u2028\\u202e\\u2067"}'
    )
    expect(hasUnsafeTerminalControl(escaped)).toBe(false)
  })

  it('measures the emitted UTF-8 bytes after terminal escaping', () => {
    const value = { text: '\u0085\u202e' }
    const serialized = stringifyTerminalSafeJson(value)

    expect(getTerminalSafeJsonByteLength(value)).toBe(
      getUtf8ByteLength(serialized)
    )
    expect(getTerminalSafeJsonByteLength(value)).toBeGreaterThan(
      getUtf8ByteLength(JSON.stringify(value))
    )
  })

  it.each([undefined, () => {}, Symbol('value')])(
    'serializes a top-level non-JSON value as null',
    (value) => {
      const serialized = stringifyTerminalSafeJson(value)

      expect(serialized).toBe('null')
      expect(JSON.parse(serialized)).toBeNull()
    }
  )
})

function hasUnsafeTerminalControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return (
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x061c ||
      code === 0x200e ||
      code === 0x200f ||
      (code >= 0x2028 && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    )
  })
}

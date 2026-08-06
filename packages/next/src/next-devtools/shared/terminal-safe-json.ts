export function escapeTerminalText(value: string): string {
  return escapeTerminalControls(value, true)
}

export function stringifyTerminalSafeJson(
  value: unknown,
  space?: number
): string {
  return escapeTerminalControls(
    JSON.stringify(value, null, space) ?? 'null',
    false
  )
}

export function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function getTerminalSafeJsonByteLength(value: unknown): number {
  return getUtf8ByteLength(stringifyTerminalSafeJson(value))
}

function escapeTerminalControls(value: string, includeC0: boolean): string {
  let escaped = ''
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (
      (includeC0 && code <= 0x1f) ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x061c ||
      code === 0x200e ||
      code === 0x200f ||
      (code >= 0x2028 && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    ) {
      escaped += `\\u${code.toString(16).padStart(4, '0')}`
    } else {
      escaped += character
    }
  }
  return escaped
}

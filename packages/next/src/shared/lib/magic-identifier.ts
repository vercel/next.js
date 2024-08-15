function decodeHex(hexStr: string): string {
  if (hexStr.trim() === '') {
    throw new Error("can't decode empty hex")
  }

  const num = parseInt(hexStr, 16)
  if (isNaN(num)) {
    throw new Error(`invalid hex: \`${hexStr}\``)
  }

  return String.fromCodePoint(num)
}

const enum Mode {
  Text,
  Underscore,
  Hex,
  LongHex,
}

const DECODE_REGEX = /^__TURBOPACK__([a-zA-Z0-9_$]+)__$/

export function decodeMagicIdentifier(identifier: string): string {
  const matches = identifier.match(DECODE_REGEX)
  if (!matches) {
    return identifier
  }

  const inner = matches[1]

  let output = ''

  let mode: Mode = Mode.Text
  let buffer = ''
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i]

    if (mode === Mode.Text) {
      if (char === '_') {
        mode = Mode.Underscore
      } else if (char === '$') {
        mode = Mode.Hex
      } else {
        output += char
      }
    } else if (mode === Mode.Underscore) {
      if (char === '_') {
        output += ' '
        mode = Mode.Text
      } else if (char === '$') {
        output += '_'
        mode = Mode.Hex
      } else {
        output += char
        mode = Mode.Text
      }
    } else if (mode === Mode.Hex) {
      if (buffer.length === 2) {
        output += decodeHex(buffer)
        buffer = ''
      }

      if (char === '_') {
        if (buffer !== '') {
          throw new Error(`invalid hex: \`${buffer}\``)
        }

        mode = Mode.LongHex
      } else if (char === '$') {
        if (buffer !== '') {
          throw new Error(`invalid hex: \`${buffer}\``)
        }

        mode = Mode.Text
      } else {
        buffer += char
      }
    } else if (mode === Mode.LongHex) {
      if (char === '_') {
        throw new Error(`invalid hex: \`${buffer + char}\``)
      } else if (char === '$') {
        output += decodeHex(buffer)
        buffer = ''

        mode = Mode.Text
      } else {
        buffer += char
      }
    }
  }

  return output
}

export const MAGIC_IDENTIFIER_REGEX = /__TURBOPACK__[a-zA-Z0-9_$]+__/g

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

/**
 * Cleans up module IDs by removing implementation details.
 * - Replaces [project] with .
 * - Removes content in brackets [], parentheses (), and angle brackets <>
 */
export function deobfuscateModuleId(moduleId: string): string {
  return (
    moduleId
      // Replace [project] with .
      .replace(/\[project\]/g, '.')
      // Remove content in square brackets (e.g. [app-rsc])
      .replace(/\s*\[([^\]]*)\]/g, '')
      // Remove content in parentheses (e.g. (ecmascript))
      .replace(/\s*\(([^)]*)\)/g, '')
      // Remove content in angle brackets (e.g. <locals>)
      .replace(/\s*<([^>]*)>/g, '')
      // Clean up any extra whitespace
      .trim()
  )
}

/**
 * Removes the free call wrapper pattern (0, expr) from expressions.
 * This is a JavaScript pattern to call a function without binding 'this',
 * but it's noise for developers reading error messages.
 */
export function removeFreeCallWrapper(text: string): string {
  // Match (0, <ident>.<ident>) patterns anywhere in the text the beginning
  // Use Unicode property escapes (\p{ID_Start}, \p{ID_Continue}) for full JS identifier support
  // Requires the 'u' (unicode) flag in the regex
  return text.replace(
    /\(0\s*,\s*(__TURBOPACK__[a-zA-Z0-9_$]+__\.[\p{ID_Start}_$][\p{ID_Continue}$]*)\)/u,
    '$1'
  )
}

/**
 * Deobfuscates text by:
 * 1. Decoding magic identifiers
 * 2. Cleaning up module IDs
 * 3. Removing free call wrappers
 */
export function deobfuscateText(text: string): string {
  // First, remove free call wrappers, doing this first is important since the demangling might
  // introduce whitespace character that complicate the matching.
  let result = removeFreeCallWrapper(text)

  // Then decode magic identifiers and clean up module IDs
  result = result.replaceAll(MAGIC_IDENTIFIER_REGEX, (ident) => {
    try {
      const decoded = decodeMagicIdentifier(ident)
      // If it was a magic identifier, clean up the module ID
      if (decoded !== ident) {
        // Check if this is an "imported module" reference
        const importedModuleMatch = decoded.match(/^imported module (.+)$/)
        if (importedModuleMatch) {
          // Clean the entire module path (which includes [app-rsc], etc.)
          const modulePathWithMetadata = importedModuleMatch[1]
          const cleaned = deobfuscateModuleId(modulePathWithMetadata)
          return `{imported module ${cleaned}}`
        }

        const cleaned = deobfuscateModuleId(decoded)
        return `{${cleaned}}`
      }
      return ident
    } catch (e) {
      return `{${ident} (decoding failed: ${e})}`
    }
  })

  return result
}

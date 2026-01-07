// x-matched-path header can be decoded incorrectly
// and should only be utf8 characters so this fixes
// incorrectly encoded values
export function fixMojibake(input: string): string {
  // Convert each character's char code to a byte
  const bytes = new Uint8Array(input.length)
  for (let i = 0; i < input.length; i++) {
    bytes[i] = input.charCodeAt(i)
  }

  // Decode the bytes as proper UTF-8
  const decoder = new TextDecoder('utf-8')
  return decoder.decode(bytes)
}

/**
 * Attempts to recover a header value that may have been corrupted by
 * UTF-8 bytes being interpreted as Latin-1 characters (Mojibake).
 *
 * For example, "Montréal" sent as UTF-8 (bytes: 4D 6F 6E 74 72 C3 A9 61 6C)
 * might arrive as "MontrÃ©al" when those UTF-8 bytes are interpreted as Latin-1.
 *
 * This function detects this pattern and recovers the original UTF-8 string.
 * Unlike fixMojibake, this function is safe to call on any string - it will
 * return the original value if decoding fails or if the value isn't Mojibake.
 */
export function recoverMojibake(value: string): string {
  // Check if value contains non-ASCII characters that could be Mojibake
  if (!/[\x80-\xFF]/.test(value)) {
    return value
  }

  try {
    // Convert the string to Latin-1 bytes, then decode as UTF-8
    const bytes = new Uint8Array(value.length)
    for (let i = 0; i < value.length; i++) {
      bytes[i] = value.charCodeAt(i)
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    // If decoding succeeded and produced a different string, we recovered from Mojibake
    if (decoded !== value) {
      return decoded
    }
  } catch {
    // If UTF-8 decoding fails, the value wasn't Mojibake - return original
  }
  return value
}

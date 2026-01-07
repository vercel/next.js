/**
 * Mojibake utilities for handling UTF-8 bytes incorrectly interpreted as Latin-1.
 *
 * "Mojibake" occurs when UTF-8 encoded text is incorrectly decoded as Latin-1 (ISO-8859-1).
 * For example, "Montréal" encoded as UTF-8 (bytes: 4D 6F 6E 74 72 C3 A9 61 6C)
 * becomes "MontrÃ©al" when those bytes are interpreted as Latin-1 characters.
 *
 * This commonly happens with HTTP headers from CDNs that send
 * UTF-8 values (e.g., x-city: "Montréal") which get mangled when Node.js
 * interprets them as Latin-1.
 */

/**
 * Encodes a UTF-8 string to its Mojibake representation.
 * This simulates what happens when UTF-8 bytes are interpreted as Latin-1.
 *
 * @param input - The UTF-8 string to encode
 * @returns The Mojibake representation of the string
 */
export function encodeMojibake(input: string): string {
  const encoder = new TextEncoder() // UTF-8
  const bytes = encoder.encode(input)
  // Interpret UTF-8 bytes as Latin-1 characters
  return Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('')
}

/**
 * Decodes a Mojibake string back to proper UTF-8.
 * This is safe to call on any string - it will return the original value
 * if decoding fails or if the value isn't Mojibake.
 *
 * @param input - The potentially Mojibake-encoded string
 * @returns The decoded UTF-8 string, or the original if not Mojibake
 */
export function decodeMojibake(input: string): string {
  // Check if value contains non-ASCII characters that could be Mojibake
   
  if (!/[\x80-\xFF]/.test(input)) {
    return input
  }

  try {
    // Convert the string to Latin-1 bytes, then decode as UTF-8
    const bytes = new Uint8Array(input.length)
    for (let i = 0; i < input.length; i++) {
      bytes[i] = input.charCodeAt(i)
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    // If decoding succeeded and produced a different string, we recovered from Mojibake
    if (decoded !== input) {
      return decoded
    }
  } catch {
    // If UTF-8 decoding fails, the value wasn't Mojibake - return original
  }
  return input
}

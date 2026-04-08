/**
 * Decodes a base64 string to a Uint8Array.
 *
 * Prefers `Uint8Array.fromBase64` (ES2024) as a fast native path,
 * with an `atob()`-based fallback for older environments.
 */
export function base64Decode(base64: string): Uint8Array {
  if (typeof (Uint8Array as any).fromBase64 === 'function') {
    return (Uint8Array as any).fromBase64(base64)
  }
  const binaryString = atob(base64)
  const buffer = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    buffer[i] = binaryString.charCodeAt(i)
  }
  return buffer
}

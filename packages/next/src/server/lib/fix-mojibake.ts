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

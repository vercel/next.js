export function encodeText(input: string) {
  return new TextEncoder().encode(input)
}

export function decodeText(
  input: Uint8Array | undefined,
  textDecoder: TextDecoder,
  isStream = true
) {
  return textDecoder.decode(input, { stream: isStream })
}

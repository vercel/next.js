// Buffer.byteLength polyfill in the Edge runtime, with only utf8 strings
// supported at the moment.
const textEncoder = new TextEncoder()

export function byteLength(payload: string): number {
  return textEncoder.encode(payload).buffer.byteLength
}

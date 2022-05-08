// Buffer.byteLength polyfill in the Edge runtime, with only utf8 strings
// supported at the moment.
export function byteLength(payload: string): number {
  return new TextEncoder().encode(payload).buffer.byteLength
}

// Calculate the ETag for a payload.
export async function generateETag(payload: string) {
  if (payload.length === 0) {
    // fast-path empty
    return '"0-2jmj7l5rSw0yVb/vlWAYkK/YBwk"'
  }

  // compute hash of entity
  const hash = btoa(
    String.fromCharCode.apply(
      null,
      new Uint8Array(
        await crypto.subtle.digest('SHA-1', new TextEncoder().encode(payload))
      ) as any
    )
  ).substring(0, 27)

  // compute length of entity
  const len = byteLength(payload)

  return '"' + len.toString(16) + '-' + hash + '"'
}

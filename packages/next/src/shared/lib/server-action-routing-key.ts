const textEncoder = new TextEncoder()

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Creates a public routing key for a Server Action without disclosing its
 * unguessable action ID. The key is only used to associate an action reference
 * the client already possesses with a route that can execute it.
 */
export async function createServerActionRoutingKey(
  actionId: string
): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(actionId)
  )
  return encodeBase64Url(new Uint8Array(digest))
}

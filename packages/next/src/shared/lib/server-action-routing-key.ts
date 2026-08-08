import fnv1a from './fnv1a'

/**
 * Creates an opaque routing key for a Server Action without serializing its
 * full action ID in the route payload. The key only associates an action
 * reference the client already possesses with a route that can execute it. It
 * is not a security boundary; the server still validates the full action ID.
 */
export function createServerActionRoutingKey(actionId: string): string {
  return fnv1a(actionId, { size: 128 }).toString(36)
}

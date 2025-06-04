/**
 * Clones a response by teeing the body so we can return two independent
 * ReadableStreams from it. This avoids the bug in the undici library around
 * response cloning.
 *
 * After cloning, the original response's body will be consumed and closed.
 *
 * @see https://github.com/vercel/next.js/pull/73274
 *
 * @param original - The original response to clone.
 * @returns A tuple containing two independent clones of the original response.
 */
export function cloneResponse(original: Response): [Response, Response] {
  // If the response has no body, then we can just return the original response
  // twice because it's immutable.
  if (!original.body) {
    return [original, original]
  }

  const [body1, body2] = original.body.tee()

  const cloned1 = new Response(body1, {
    status: original.status,
    statusText: original.statusText,
    headers: original.headers,
  })

  Object.defineProperty(cloned1, 'url', {
    value: original.url,
  })

  const cloned2 = new Response(body2, {
    status: original.status,
    statusText: original.statusText,
    headers: original.headers,
  })

  Object.defineProperty(cloned2, 'url', {
    value: original.url,
  })

  return [cloned1, cloned2]
}

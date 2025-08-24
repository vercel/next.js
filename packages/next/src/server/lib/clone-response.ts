const noop = () => {}

let registry: FinalizationRegistry<WeakRef<ReadableStream>> | undefined

if (globalThis.FinalizationRegistry) {
  registry = new FinalizationRegistry((weakRef: WeakRef<ReadableStream>) => {
    const stream = weakRef.deref()
    if (stream && !stream.locked) {
      stream.cancel('Response object has been garbage collected').then(noop)
    }
  })
}

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
    // How the original response.url behaves
    configurable: true,
    enumerable: true,
    writable: false,
  })

  // The Fetch Standard allows users to skip consuming the response body by
  // relying on garbage collection to release connection resources.
  // https://github.com/nodejs/undici?tab=readme-ov-file#garbage-collection
  //
  // To cancel the stream you then need to cancel both resulting branches.
  // Teeing a stream will generally lock it for the duration, preventing other
  // readers from locking it.
  // https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/tee

  // cloned2 is stored in a react cache and cloned for subsequent requests.
  // It is the original request, and is is garbage collected by a
  // FinalizationRegistry in Undici, but since we're tee-ing the stream
  // ourselves, we need to cancel clone1's stream (the response returned from
  // our dedupe fetch) when clone1 is reclaimed, otherwise we leak memory.
  if (registry && cloned1.body) {
    registry.register(cloned1, new WeakRef(cloned1.body))
  }

  const cloned2 = new Response(body2, {
    status: original.status,
    statusText: original.statusText,
    headers: original.headers,
  })

  Object.defineProperty(cloned2, 'url', {
    value: original.url,
    // How the original response.url behaves
    configurable: true,
    enumerable: true,
    writable: false,
  })

  return [cloned1, cloned2]
}

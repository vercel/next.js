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

  // The Fetch Standard allows users to skip consuming the response body by
  // relying on garbage collection to release connection resources.
  // https://github.com/nodejs/undici?tab=readme-ov-file#garbage-collection
  //
  // To cancel the stream you then need to cancel both resulting branches.
  // Teeing a stream will generally lock it for the duration, preventing other
  // readers from locking it.
  // https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/tee
  if (registry) {
    if (cloned1.body) {
      registry.register(cloned1, new WeakRef(cloned1.body))
    }

    if (cloned2.body) {
      registry.register(cloned2, new WeakRef(cloned2.body))
    }
  }

  return [cloned1, cloned2]
}

type AbortCancellations = Array<() => void>
const cancellationsBySignal = new WeakMap<AbortSignal, AbortCancellations>()

/**
 * Registers `cancel` to run when `signal` aborts. A single native `abort`
 * listener is attached per signal and fans out to the registered callbacks (the
 * same approach as `makeHangingPromise`), so a render that performs many cached
 * fetches doesn't add one listener per fetch and trigger a
 * `MaxListenersExceededWarning`.
 */
function runOnAbort(signal: AbortSignal, cancel: () => void): void {
  const existing = cancellationsBySignal.get(signal)
  if (existing) {
    existing.push(cancel)
    return
  }

  const cancellations: AbortCancellations = [cancel]
  cancellationsBySignal.set(signal, cancellations)
  signal.addEventListener(
    'abort',
    () => {
      // Detach first so the callbacks (and the WeakRefs they hold) are released.
      cancellationsBySignal.delete(signal)
      for (let i = 0; i < cancellations.length; i++) {
        // A throw from one cancellation must not starve the others.
        try {
          cancellations[i]()
        } catch {}
      }
    },
    { once: true }
  )
}

/**
 * Deterministically cancels a *retained, un-consumed* response body when
 * `signal` aborts, releasing the off-heap bytes buffered in its `tee()` branch
 * instead of waiting for the `FinalizationRegistry` to run on the next GC.
 *
 * Pass only a body you retain un-read — e.g. the second `cloneResponse` clone
 * stored in the fetch dedupe cache. Do NOT pass a body that is returned to a
 * consumer: cancelling one the consumer is about to read would race that read.
 * (A body that is already being read is `locked`, and is left untouched.)
 *
 * This matters because the buffered bytes are off-heap (`arrayBuffers` /
 * `external`), so they don't create the JS-heap pressure that schedules GC and
 * can otherwise grow until OOM under sustained, high-cardinality load.
 *
 * @see https://github.com/vercel/next.js/issues/92287
 */
export function cancelUnconsumedBodyOnAbort(
  signal: AbortSignal | null | undefined,
  body: ReadableStream | null | undefined
): void {
  if (!signal || !body) {
    return
  }

  // Hold only a WeakRef so this never itself keeps the tee branch (and its
  // buffered bytes) alive: if the body is still reachable when the signal
  // aborts — the leak scenario, where a dedupe/cache map retains it — we cancel
  // it; otherwise the WeakRef derefs to undefined and the `FinalizationRegistry`
  // above reclaims it.
  const bodyRef = new WeakRef(body)
  const cancel = () => {
    const stream = bodyRef.deref()
    if (stream && !stream.locked) {
      stream.cancel('Retained response is no longer needed').then(noop, noop)
    }
  }

  if (signal.aborted) {
    // Defer so the caller's synchronous setup runs before we cancel.
    queueMicrotask(cancel)
  } else {
    runOnAbort(signal, cancel)
  }
}

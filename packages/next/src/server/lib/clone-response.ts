const noop = () => {}

let registry: FinalizationRegistry<WeakRef<ReadableStream>> | undefined

if (globalThis.FinalizationRegistry) {
  registry = new FinalizationRegistry((weakRef: WeakRef<ReadableStream>) => {
    const stream = weakRef.deref()
    if (stream && !stream.locked) {
      stream
        .cancel('Response object has been garbage collected')
        .then(noop, noop)
    }
  })
}

/**
 * Cancels a cloned response body that was never consumed (i.e. is not
 * `locked`), releasing the off-heap bytes buffered in its `tee()` branch.
 *
 * A branch that is currently being read is `locked`; we leave it alone so that
 * an in-flight read (such as the cache write that drains the sibling branch)
 * can finish normally.
 */
function cancelUnconsumedBody(body: ReadableStream | null | undefined) {
  if (body && !body.locked) {
    body.cancel('Response is no longer needed').then(noop, noop)
  }
}

type AbortCancellations = Array<() => void>
const cancellationsBySignal = new WeakMap<AbortSignal, AbortCancellations>()

/**
 * Registers `cancel` to run when `signal` aborts. We attach a single native
 * `abort` listener per signal and fan out to the registered callbacks (the same
 * approach as `makeHangingPromise`), so that a render that performs many cached
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
      // Detach first so the callbacks (and the WeakRefs they hold) can be
      // released once they've run.
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
 * Clones a response by teeing the body so we can return two independent
 * ReadableStreams from it. This avoids the bug in the undici library around
 * response cloning.
 *
 * After cloning, the original response's body will be consumed and closed.
 *
 * @see https://github.com/vercel/next.js/pull/73274
 *
 * Only `cloned2` is eligible for `signal`-driven cancellation; `cloned1` is the
 * branch the framework consumes now and is never cancelled from under it. Pass
 * a `signal` only when `cloned2` is retained un-consumed (e.g. the fetch dedupe
 * cache); never when it is returned to a reader, since cancelling would race
 * that read. Returned branches rely on the `FinalizationRegistry` backstop.
 *
 * @param original - The original response to clone.
 * @param signal - When provided, cancels the retained, un-read `cloned2` as soon
 * as it aborts (typically the render's `renderSignal`), freeing its buffered tee
 * branch deterministically instead of waiting for GC. The buffered bytes are
 * off-heap, so they don't create the JS-heap pressure that schedules GC and can
 * otherwise grow until OOM under sustained load.
 * @see https://github.com/vercel/next.js/issues/92287
 * @returns A tuple containing two independent clones of the original response.
 */
export function cloneResponse(
  original: Response,
  signal?: AbortSignal | null
): [Response, Response] {
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

  if (signal) {
    // Cancel only `cloned2` — the retained, un-consumed branch (see the
    // `@param signal` docs above). We hold only a WeakRef so this callback never
    // itself keeps the tee branch (and its buffered bytes) alive: if `cloned2`
    // is still reachable when the signal aborts — the leak scenario, where a
    // dedupe/cache map retains it — we cancel it deterministically; otherwise
    // the WeakRef derefs to undefined and the `FinalizationRegistry` reclaims it.
    const retainedBodyRef = cloned2.body ? new WeakRef(cloned2.body) : undefined

    // `cancelUnconsumedBody` no-ops on a `locked` body, so a `cloned2` that the
    // render is actively reading is never interrupted.
    const cancelRetained = () => cancelUnconsumedBody(retainedBodyRef?.deref())

    if (signal.aborted) {
      // The render is already gone; release on the next microtask (still
      // deterministic, and after the synchronous caller setup has run).
      queueMicrotask(cancelRetained)
    } else {
      runOnAbort(signal, cancelRetained)
    }
  }

  return [cloned1, cloned2]
}

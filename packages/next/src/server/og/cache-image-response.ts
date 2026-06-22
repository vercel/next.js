import { Readable } from 'node:stream'

import { InvariantError } from '../../shared/lib/invariant-error'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { createHangingInputAbortSignal } from '../app-render/dynamic-rendering'
import { makeHangingPromise } from '../dynamic-rendering-utils'
import {
  getClientReferenceManifest,
  getServerModuleMap,
} from '../app-render/manifests-singleton'
// eslint-disable-next-line import/no-extraneous-dependencies
import { prerenderToNodeStream } from 'react-server-dom-webpack/static'
// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromNodeStream } from 'react-server-dom-webpack/client'

type OgModule = typeof import('next/dist/compiled/@vercel/og')

type ImageResponseArgs = ConstructorParameters<OgModule['ImageResponse']>

function importOgModule(): Promise<OgModule> {
  // Cache Components is Node-only (rejected for the edge runtime at compile
  // time), so we always load the Node build. Loading it dynamically keeps the
  // heavy `@vercel/og` renderer (satori + WASM) off the module-load path, so
  // it's pulled in only when an image is actually rendered.
  return import('next/dist/compiled/@vercel/og/index.node.js')
}

/**
 * Builds the body for a Cache Components `ImageResponse`. The rendered image is
 * cached in the Resume Data Cache during a prerender, so the prospective
 * prerender renders it once and the final prerender retrieves it from memory
 * within microtasks. This lets metadata image routes be statically prerendered
 * under Cache Components instead of being treated as dynamic.
 *
 * The cache boundary is drawn around only the deterministic rasterization of
 * the element tree into an image. The `ImageResponse` element tree is rendered
 * with React Flight once, inside the prerender work-unit store, so any
 * user-space I/O (e.g. `cookies()` or an uncached `fetch`) runs in the correct
 * scope and is subject to the normal Cache Components rules. If that tree
 * needs dynamic input the serialization can't complete, and the route falls
 * back to dynamic. Otherwise the fully resolved tree is handed to satori,
 * which never re-runs the user's components.
 *
 * Outside of a prerender (normal requests) this just renders.
 */
export function getCachedImageResponseBody(
  args: ImageResponseArgs
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const arrayBuffer = await getCachedImageResponseArrayBuffer(args)
      if (arrayBuffer.byteLength > 0) {
        controller.enqueue(new Uint8Array(arrayBuffer))
      }
      controller.close()
    },
  })
}

async function getCachedImageResponseArrayBuffer(
  args: ImageResponseArgs
): Promise<ArrayBuffer> {
  const workUnitStore = workUnitAsyncStorage.getStore()

  switch (workUnitStore?.type) {
    case 'prerender':
      // We only cache during a prerender. Metadata image routes compile to
      // route handlers, which use the `prerender` store.
      break
    case undefined:
    case 'request':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'prerender-runtime':
    case 'prerender-client':
    case 'validation-client':
    case 'prerender-ppr':
    case 'prerender-legacy':
    case 'generate-static-params':
      return renderImageResponseArrayBuffer(args)
    default:
      return workUnitStore satisfies never
  }

  const { cacheSignal, resumeDataCache, renderSignal } = workUnitStore

  if (!resumeDataCache) {
    return renderImageResponseArrayBuffer(args)
  }

  const workStore = workAsyncStorage.getStore()

  if (!workStore) {
    throw new InvariantError(
      'Expected a work store while caching an `ImageResponse` during prerendering.'
    )
  }

  // `createHangingInputAbortSignal` aborts once the prerender's cache-sourced
  // input is ready, so anything the serialization below is still awaiting past
  // that point can be treated as dynamic (non-cache) input. In the prospective
  // pass it aborts when `cacheSignal.inputReady()` resolves (no cache reads
  // in progress); in the final pass the caches are already filled, so it just
  // aborts on the next tick.
  const hangingInputAbortSignal = createHangingInputAbortSignal(workUnitStore)

  // We open the cache read lazily, once we know the serialization completed and
  // we're about to render and store the image. Opening it before serializing
  // would keep `cacheSignal.inputReady()` from resolving and thus prevent the
  // abort signal from ever firing, deadlocking the prospective prerender.
  let readState: 'ready' | 'pending' | 'done' = 'ready'

  function beginReadOnce() {
    if (readState === 'ready') {
      readState = 'pending'
      cacheSignal?.beginRead()
    }
  }

  function endReadIfStarted() {
    if (readState === 'pending') {
      cacheSignal?.endRead()
    }
    readState = 'done'
  }

  // We serialize the element tree with `prerenderToNodeStream` rather than
  // `renderToPipeableStream`. It's the right fit for prerendering, and it
  // schedules work deferred for size (`deferTask`) on microtasks, so a fully
  // static tree finishes flushing before the abort signal fires; a tree still
  // pending at abort time is then genuinely waiting on dynamic input rather
  // than just deferred.
  //
  // `renderToPipeableStream` would schedule that deferred work on
  // `setImmediate` instead, which isn't necessarily a deal-breaker: the
  // sequential-task scheme page rendering uses (`runInSequentialTasks`) drains
  // pending immediates at each task boundary, so deferred work still runs in
  // time. But route handler prerendering doesn't use that scheme, so here the
  // deferred immediates would race the abort.
  //
  // The prerender halts silently on abort, leaving unfulfilled references in
  // place rather than reporting through `onError`. So to tell a halt (the tree
  // needed dynamic input) apart from a normal completion, we record whether the
  // abort fired before the serialization finished. `abort()` runs this listener
  // synchronously, well before we read `resultIsPartial` below.
  let prerenderCompleted = false
  let resultIsPartial = false
  let serializationError: unknown

  hangingInputAbortSignal.addEventListener(
    'abort',
    () => {
      if (!prerenderCompleted) {
        resultIsPartial = true
      }
    },
    { once: true }
  )

  const { clientModules, rscModuleMapping } = getClientReferenceManifest()

  try {
    const { prelude } = await prerenderToNodeStream(args, clientModules, {
      signal: hangingInputAbortSignal,
      filterStackFrame: undefined,
      onError(error) {
        // A halt (our deliberate abort) emits nothing, so this is only called
        // for genuine serialization errors. We surface the first one.
        if (serializationError === undefined && !resultIsPartial) {
          serializationError = error
        }
      },
    })

    prerenderCompleted = true

    if (serializationError !== undefined) {
      throw serializationError
    }

    if (resultIsPartial) {
      // The element tree needed dynamic input (e.g. `cookies()` or an uncached
      // `fetch`), so the image can't be produced statically. Return a hanging
      // promise: the body never resolves, and the final prerender's macrotask
      // budget then classifies the route as dynamic.
      return makeHangingPromise<ArrayBuffer>(
        renderSignal,
        workStore.route,
        'dynamic `ImageResponse`'
      )
    }

    // The serialization finished before any dynamic input was needed, so we
    // will render and cache the image. Hold the cache read now, before the
    // stream is buffered and deserialized below, so that the prospective
    // prerender's `cacheReady()` waits for the image to be stored.
    beginReadOnce()

    const chunks: Buffer[] = []
    for await (const chunk of prelude) {
      chunks.push(chunk)
    }

    const buffer = Buffer.concat(chunks)
    // Base64-encode the serialized output to use it as a stable string key
    // (the Flight stream is binary, so it isn't safe to treat as UTF-8 text).
    const cacheKey = buffer.toString('base64')

    const cached = resumeDataCache.imageResponses.get(cacheKey)

    if (cached) {
      return await cached
    }

    // Deserialize the resolved tree and hand it to satori. Because the user's
    // components already ran during serialization, satori only walks resolved
    // host elements and never re-runs them, confining user-space I/O to the
    // in-store serialization above.
    //
    // The Flight client hands back the output of an async Server Component as
    // a `React.lazy` (sync components and plain host elements are inlined).
    // satori can't unwrap lazies, so we resolve them into plain elements first.
    // We only reach here once the serialization completed, so every lazy is
    // already resolved and `_init` returns synchronously.
    const resolvedArgs = resolveFlightLazies(
      await createFromNodeStream(
        Readable.from([buffer]),
        {
          // We don't want to trigger preloads of client references here.
          moduleLoading: null,
          moduleMap: rscModuleMapping,
          serverModuleMap: getServerModuleMap(),
        },
        { findSourceMapURL: undefined }
      )
    ) as ImageResponseArgs

    // Render satori outside the prerender work-unit store. It does uncached
    // `fetch` calls (e.g. loading a font), and inside a Cache Components
    // prerender an uncached `fetch` outside a cache scope becomes a hanging
    // promise. Those are framework fetches, not user I/O, so we let them
    // resolve normally with no store.
    const arrayBufferPromise = workUnitAsyncStorage.exit(() =>
      renderImageResponseArrayBuffer(resolvedArgs)
    )

    if (resumeDataCache.mutable) {
      resumeDataCache.imageResponses.set(cacheKey, arrayBufferPromise)
    }

    return await arrayBufferPromise
  } finally {
    endReadIfStarted()
  }
}

async function renderImageResponseArrayBuffer(
  args: ImageResponseArgs
): Promise<ArrayBuffer> {
  const OGImageResponse = (await importOgModule()).ImageResponse
  const imageResponse = new OGImageResponse(...args)

  if (!imageResponse.body) {
    return new ArrayBuffer(0)
  }

  return imageResponse.arrayBuffer()
}

const REACT_LAZY_TYPE = Symbol.for('react.lazy')

/**
 * Recursively replaces the `React.lazy` references that Flight emits for
 * resolved async Server Components with the elements they resolve to, so that
 * satori (which doesn't understand lazy nodes) can walk the tree. This must
 * only be called on a fully resolved (completed) Flight result, where each
 * lazy's `_init` returns synchronously rather than suspending.
 */
function resolveFlightLazies(node: unknown): unknown {
  if (node === null || typeof node !== 'object') {
    return node
  }

  if ((node as { $$typeof?: symbol }).$$typeof === REACT_LAZY_TYPE) {
    const lazy = node as {
      _init: (payload: unknown) => unknown
      _payload: unknown
    }
    return resolveFlightLazies(lazy._init(lazy._payload))
  }

  if (Array.isArray(node)) {
    return node.map(resolveFlightLazies)
  }

  const element = node as { props?: { children?: unknown } }
  if (element.props && 'children' in element.props) {
    return {
      ...element,
      props: {
        ...element.props,
        children: resolveFlightLazies(element.props.children),
      },
    }
  }

  return node
}

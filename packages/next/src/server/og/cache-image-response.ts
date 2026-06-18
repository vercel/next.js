import { PassThrough, Writable } from 'node:stream'

import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
// eslint-disable-next-line import/no-extraneous-dependencies
import { renderToPipeableStream } from 'react-server-dom-webpack/server'
import { getClientReferenceManifest } from '../app-render/manifests-singleton'

type OgModule = typeof import('next/dist/compiled/@vercel/og')

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
 * The cache boundary is drawn around only the deterministic JSX -> image
 * rasterization. The handler that constructs the `ImageResponse` still re-runs
 * on every prerender pass, so any user-space I/O remains subject to the normal
 * Cache Components rules (it must be wrapped in `use cache` by the user). If
 * the inputs don't reproduce across the prospective and final passes, the cache
 * keys diverge, the final render re-renders, and the route falls back to
 * dynamic.
 *
 * Outside of a prerender (normal requests) this just renders.
 */
export function getCachedImageResponseBody(
  args: ConstructorParameters<OgModule['ImageResponse']>
): ReadableStream {
  return new ReadableStream({
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
  args: ConstructorParameters<OgModule['ImageResponse']>
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

  const { cacheSignal, resumeDataCache } = workUnitStore

  if (!resumeDataCache) {
    return renderImageResponseArrayBuffer(args)
  }

  // Begin a cache read synchronously, before any await, so the prospective
  // prerender's `cacheReady()` doesn't resolve until the image is rendered and
  // stored. The final prerender has no cache signal, so this is a no-op there.
  cacheSignal?.beginRead()

  try {
    const cacheKey = await serializeImageResponseArgs(args)
    const cached = resumeDataCache.imageResponses.get(cacheKey)

    if (cached) {
      return await cached
    }

    // Render outside the prerender work-unit store. The renderer does uncached
    // `fetch` calls (e.g. loading a font or a remote image), and inside a Cache
    // Components prerender an uncached `fetch` outside a cache scope is turned
    // into a hanging promise, since Cache Components skips I/O that wouldn't be
    // cached anyway. That would stall the render forever during the prospective
    // pass, so we run it with no store, letting those fetches resolve normally.
    //
    // Running it in a cache scope would also avoid the hang, but it would route
    // those fetches through the serialized `cache` / `fetch` resume data stores
    // and bloat the resume data that ships with the prerender. The only
    // artifact we intentionally cache is the rendered image, in the
    // in-memory-only `imageResponses` store.
    const arrayBufferPromise = workUnitAsyncStorage.exit(() =>
      renderImageResponseArrayBuffer(args)
    )

    if (resumeDataCache.mutable) {
      resumeDataCache.imageResponses.set(cacheKey, arrayBufferPromise)
    }

    return await arrayBufferPromise
  } finally {
    cacheSignal?.endRead()
  }
}

async function renderImageResponseArrayBuffer(
  args: ConstructorParameters<OgModule['ImageResponse']>
): Promise<ArrayBuffer> {
  const OGImageResponse = (await importOgModule()).ImageResponse
  const imageResponse = new OGImageResponse(...args) as Response

  if (!imageResponse.body) {
    return new ArrayBuffer(0)
  }

  return imageResponse.arrayBuffer()
}

/**
 * Builds a stable cache key from the `ImageResponse` constructor args by
 * serializing them with React Flight, the same mechanism
 * `encryptActionBoundArgs` uses for server action bound args. This handles
 * arbitrary component trees and client references, not just intrinsic-element
 * JSX.
 */
async function serializeImageResponseArgs(
  args: ConstructorParameters<OgModule['ImageResponse']>
): Promise<string> {
  const { clientModules } = getClientReferenceManifest()

  const { pipe } = renderToPipeableStream(args, clientModules, {
    // Only affects error-stack formatting and I/O tracking, which is irrelevant
    // for a cache key.
    filterStackFrame: undefined,
    // Debug info embeds per-call timing that would destabilize the key, so
    // discard it via a throwaway writable. It is only emitted in development;
    // production never includes it.
    debugChannel:
      process.env.NODE_ENV === 'development'
        ? new Writable({ write: (_chunk, _encoding, callback) => callback() })
        : undefined,
  })

  const passThrough = new PassThrough()
  pipe(passThrough)

  const decoder = new TextDecoder('utf-8', { fatal: true })
  let serialized = ''
  for await (const chunk of passThrough) {
    serialized += decoder.decode(chunk, { stream: true })
  }
  serialized += decoder.decode()

  return serialized
}

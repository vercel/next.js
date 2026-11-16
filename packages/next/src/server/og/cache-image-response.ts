import { Readable, Writable } from 'node:stream'
import { createHash, type Hash } from 'node:crypto'

import { InvariantError } from '../../shared/lib/invariant-error'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { renderToPipeableStream } from '../app-render/react-server.node'
import { makeDynamicHangingPromise } from '../dynamic-rendering-utils'
import {
  getClientReferenceManifest,
  getServerModuleMap,
} from '../app-render/manifests-singleton'
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
    case 'prerender-legacy':
    case 'build-time-generator':
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

  const [element, options] = args

  // We start the cache read only after serialization completes and the image
  // cache lookup misses. It covers Flight deserialization and image rendering.
  // If the element suspends on request data, an earlier read would prevent
  // cacheReady() from triggering abortSerialization. The route handler's
  // prospective prerender pass also awaits cacheReady(), so both the
  // serialization and that pass would remain stuck.
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

  const { clientModules, rscModuleMapping } = getClientReferenceManifest()
  const chunks: Buffer[] = []
  let serializationCompleted = false
  let resultIsPartial = false
  let serializationError: unknown

  const serialized = new Promise<void>((resolve, reject) => {
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk))
        callback()
      },
    })
    destination.once('finish', () => {
      serializationCompleted = true
      resolve()
    })
    destination.once('close', () => {
      renderSignal.removeEventListener('abort', abortSerialization)
    })
    destination.once('error', reject)

    const debugDestination =
      process.env.NODE_ENV === 'development'
        ? new Writable({
            write(_chunk, _encoding, callback) {
              callback()
            },
          })
        : undefined
    debugDestination?.once('error', reject)

    // We serialize only the `element`. It's the part that needs Flight, to run
    // its async Server Components once and to surface any dynamic input. The
    // `options` are already-resolved plain data; they're folded into the cache
    // key directly and passed to satori as-is below.
    //
    // Streaming Flight can use `setImmediate` to resume suspended work, flush
    // chunks, or defer large subtrees. The route and page scheduler
    // (`runInSequentialTasks`) drains these immediates at each task boundary.
    const pipeable = renderToPipeableStream(element, clientModules, {
      filterStackFrame: undefined,
      // The debug channel keeps diagnostic values out of the bytes used as the
      // cache key. The Flight client ignores their missing references when no
      // readable debug channel is supplied.
      debugChannel: debugDestination,
      // A future time origin omits I/O debug records in both passes. Otherwise
      // the prospective pass would include records that predate the final
      // render and are omitted there. Their references would remain in the main
      // stream even with a separate debug channel and change the cache key.
      startTime:
        process.env.NODE_ENV === 'development'
          ? Number.MAX_SAFE_INTEGER
          : undefined,
      onError(error) {
        // Streaming aborts report errors through `onError`. Ignore our
        // deliberate abort and surface the first genuine serialization error.
        if (serializationError === undefined && !resultIsPartial) {
          serializationError = error
        }
      },
    })

    function abortSerialization() {
      if (!serializationCompleted) {
        // Record the partial result before aborting, because abort can call
        // `onError` synchronously for the unfinished work.
        resultIsPartial = true
        pipeable.abort()
      }
    }

    pipeable.pipe(destination)

    if (renderSignal.aborted) {
      abortSerialization()
    } else {
      renderSignal.addEventListener('abort', abortSerialization, { once: true })
    }

    if (cacheSignal) {
      void cacheSignal.cacheReady().then(abortSerialization)
    }
  })

  try {
    await serialized

    if (serializationError !== undefined) {
      throw serializationError
    }

    if (resultIsPartial) {
      // The element tree did not finish before the cutoff, for example because
      // it awaited `cookies()` or an uncached `fetch`. Return a hanging promise
      // so the final prerender's body deadline classifies the route as dynamic.
      //
      // Request APIs classify their own hanging promises: `cookies()` creates a
      // runtime hanging promise, and an uncached fetch creates a dynamic one.
      // This wrapper adds no new information about the input, so it can use the
      // non-recording dynamic variant.
      return makeDynamicHangingPromise<ArrayBuffer>(
        renderSignal,
        workStore.route,
        'dynamic `ImageResponse`'
      )
    }

    const elementBuffer = Buffer.concat(chunks)

    // Derive a cache key from the serialized element plus the options.
    // We hash rather than reuse the raw serialized bytes so the key stays
    // compact even for large inputs (e.g. embedded fonts), and we fold the
    // options in by content so two images that differ only in their options
    // (size, fonts, ...) don't collide. The options are hashed directly here,
    // never serialized through Flight, which would both bloat the key and apply
    // `Buffer.prototype.toJSON` to font data.
    const hash = createHash('sha256')
    hash.update(elementBuffer)
    updateHashWithOptions(hash, options)
    const cacheKey = hash.digest('base64')

    const cached = resumeDataCache.imageResponses.get(cacheKey)

    if (cached) {
      return await cached
    }

    // Start the cache read before deserializing the element's Flight stream, so
    // the route handler's prospective prerender waits for the image to be
    // stored.
    beginReadOnce()

    // Deserialize the element and hand it to satori. Because the user's
    // components already ran during serialization, satori only walks resolved
    // host elements and never re-runs them, confining user-space I/O to the
    // in-store serialization above.
    const deserializedElement = await createFromNodeStream(
      Readable.from([elementBuffer]),
      {
        // We don't want to trigger preloads of client references here.
        moduleLoading: null,
        moduleMap: rscModuleMapping,
        serverModuleMap: getServerModuleMap(),
      },
      { findSourceMapURL: undefined }
    )

    // Flight can represent async or size-deferred subtrees as React.lazy.
    // satori can't unwrap lazies, so we resolve them into plain elements first.
    // The complete Flight buffer provides the model rows needed to initialize
    // these subtrees synchronously.
    const resolvedElement = resolveFlightLazies(deserializedElement)

    // Pair the resolved element with the original, in-memory `options`, which
    // never went through Flight. This keeps the font `Buffer` intact: had it
    // been serialized, Flight would apply the `toJSON` method that Node's
    // `Buffer` carries, turning it into a `{ type: 'Buffer', data: [...] }`
    // object that satori's font parser rejects (it needs an `ArrayBuffer` or a
    // typed array).
    const resolvedArgs = [resolvedElement, options] as ImageResponseArgs

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

/**
 * Updates a hash with a stable encoding of the `ImageResponse` options so they
 * can participate in the cache key without being serialized through Flight.
 * Binary values (font `Buffer`s, `ArrayBuffer`s, typed arrays) are hashed by
 * their raw bytes; objects are walked in sorted-key order.
 *
 * `ImageResponse` options are plain data: numbers, strings, booleans, nested
 * plain objects/arrays, and binary font data. Exotic objects such as `Map` or
 * `Date` keep their state outside their enumerable own keys, so the key walk
 * below would hash them incorrectly. We do not expect these in options, but
 * warn if one shows up so a possible cache collision can be reported.
 *
 * The encoding is self-delimiting: every node starts with a type tag, and
 * variable-length parts (byte runs, primitives, keys) are length-prefixed,
 * while arrays and objects are count-prefixed. This makes it injective, so no
 * concatenation of values can be mistaken for a differently shaped input.
 */
function updateHashWithOptions(hash: Hash, value: unknown): void {
  if (value === undefined) {
    hash.update('u')
    return
  }

  if (value === null) {
    hash.update('n')
    return
  }

  const type = typeof value

  if (type !== 'object') {
    // Tag with the primitive type so e.g. the number `1` and the string `'1'`
    // don't hash the same.
    updateHashWithBytes(hash, 'p', Buffer.from(`${type}:${String(value)}`))
    return
  }

  if (value instanceof ArrayBuffer) {
    updateHashWithBytes(hash, 'a', new Uint8Array(value))
    return
  }

  if (ArrayBuffer.isView(value)) {
    updateHashWithBytes(
      hash,
      'v',
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    )
    return
  }

  if (Array.isArray(value)) {
    hash.update(`[${value.length},`)
    for (const item of value) {
      updateHashWithOptions(hash, item)
    }
    return
  }

  // The key walk below captures a plain object faithfully, but an exotic object
  // keeps its state elsewhere (a `Map`'s/`Set`'s entries, a `Date`'s time), so
  // two different values would hash the same and could return the wrong cached
  // image. This shouldn't happen for `ImageResponse` options, so we warn rather
  // than fail, then hash best-effort, so it can be reported. Not gated on
  // `NODE_ENV`: this runs during the production `next build` prerender, where
  // the warning is most useful.
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    const typeName =
      (value as { constructor?: { name?: string } }).constructor?.name ??
      'object'
    console.warn(
      `Cannot reliably include an \`ImageResponse\` option of type ` +
        `\`${typeName}\` in the cache key, so different images may collide and ` +
        `return an incorrect cached result. Please report this to the Next.js ` +
        `team.`
    )
  }

  const keys = Object.keys(value).sort()
  hash.update(`{${keys.length},`)
  for (const key of keys) {
    updateHashWithBytes(hash, 'k', Buffer.from(key))
    updateHashWithOptions(hash, (value as Record<string, unknown>)[key])
  }
}

/**
 * Hashes a length-prefixed, tagged byte run: `<tag><byteLength>:<bytes>`. The
 * length prefix keeps the run self-delimiting so it can't blend into adjacent
 * nodes.
 */
function updateHashWithBytes(hash: Hash, tag: string, bytes: Uint8Array): void {
  hash.update(`${tag}${bytes.byteLength}:`)
  hash.update(bytes)
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

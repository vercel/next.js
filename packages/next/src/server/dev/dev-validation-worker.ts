import type { AppPageModule } from '../route-modules/app-page/module'
import type {
  DevValidationWorkerMessage,
  DevValidationWorkerResult,
} from '../app-render/dev-validation-worker-globals'
import type { NodeJsPartialHmrUpdate } from '../../build/swc/types'

import '../require-hook'
import '../node-environment'

import { isAbsolute, relative } from 'path'
import { readFileSync, realpathSync } from 'fs'
import { fileURLToPath } from 'url'
import { installBindings } from '../../build/swc/install-bindings'
import { installCodeFrameSupport } from '../lib/install-code-frame'
import {
  loadClientReferenceManifestForPage,
  loadComponents,
} from '../load-components'
import { setHttpClientAndAgentOptions } from '../setup-http-agent-env'
import { serializeValidationErrorsToFlight } from '../app-render/dev-validation-error-delivery'
import { formatValidationEvent } from '../app-render/dev-validation-events'
import { clearManifestCache } from '../load-manifest.external'
import { deleteCache } from './require-cache'
import {
  getServerActionsManifest,
  setManifestsSingleton,
} from '../app-render/manifests-singleton'
import { setBundlerFindSourceMapImplementation } from '../patch-error-inspect'
import type { ModernSourceMapPayload } from '../lib/source-maps'

/**
 * Resolves a chunk's source map by reading the `.map` file the bundler emitted
 * next to it, for chunks inside `distDir`.
 *
 * The main thread answers the same question through the Turbopack project
 * handle, which cannot cross a thread boundary. Reading from disk is
 * project-free and, more importantly, does not depend on the chunk having been
 * evaluated in this thread: Node.js caches source maps per isolate, and the
 * worker never renders server components, so it holds maps only for the chunks
 * `loadComponents` pulled in. Frames arriving in the transported payload can
 * point at any chunk the main render touched.
 *
 * Reading from disk covers the chunks, because the worker only runs under
 * Turbopack (see `next-dev-server.ts`), which writes a `.map` beside every one
 * of them. A module the server updated in place has no chunk of its own and is
 * covered instead by this thread applying the same update (see
 * `applyHmrUpdate`), which leaves its inline map in Node.js' cache here. Frames
 * from dependencies that are not bundled never reach this point, because
 * `filterStackFrameDEV` drops `node_modules` and `node:` frames; bundled
 * dependencies appear as chunks inside `distDir` like any other code.
 */
function createDiskSourceMapLookup(
  distDir: string
): (sourceURL: string) => ModernSourceMapPayload | undefined {
  // The frames carry resolved paths, so compare against the resolved `distDir`
  // to keep the containment check meaningful when the project sits behind a
  // symlink.
  let canonicalDistDir = distDir
  try {
    canonicalDistDir = realpathSync(distDir)
  } catch {}

  const payloads = new Map<string, ModernSourceMapPayload | undefined>()

  return function findSourceMapPayloadOnDisk(sourceURL) {
    let chunkPath = sourceURL

    if (chunkPath.startsWith('file://')) {
      try {
        chunkPath = fileURLToPath(chunkPath)
      } catch {
        return undefined
      }
    }

    if (!isAbsolute(chunkPath)) {
      // Not an emitted chunk, e.g. `<anonymous>`.
      return undefined
    }

    const cached = payloads.get(chunkPath)
    if (cached !== undefined || payloads.has(chunkPath)) {
      return cached
    }

    let payload: ModernSourceMapPayload | undefined
    const relativePath = relative(canonicalDistDir, chunkPath)

    // Only chunks emitted into `distDir` have a source map to point at, and
    // this keeps the lookup from reading arbitrary paths off disk.
    if (!relativePath.startsWith('..') && !isAbsolute(relativePath)) {
      try {
        payload = JSON.parse(readFileSync(chunkPath + '.map', 'utf8'))
      } catch {
        payload = undefined
      }
    }

    payloads.set(chunkPath, payload)

    return payload
  }
}

// Match the main dev server (`next-dev-server.ts`), which raises this so the
// server captures deeper stacks. React's owner-stack capture during the
// validation prerenders depends on it, so without it the worker's errors lose
// their owner-stack source attribution.
try {
  Error.stackTraceLimit = 50
} catch {}

// The lifecycle markers E2E tests read from the CLI. Emitted on the worker's
// stdout (piped to the parent) so they interleave with the parent's captured
// output the same way the in-process `runWithDevValidationLogging` markers do.
// Gated on the same test env that path checks.
const isTestLoggingEnabled = !!(
  process.env.__NEXT_TEST_MODE && process.env.NEXT_TEST_LOG_VALIDATION
)

/**
 * Adapts the pool's supersede flag into an `AbortSignal` the validation passes
 * check at their depth/yield boundaries. The pool shares an `Int32Array`-backed
 * `SharedArrayBuffer` whose first slot the main thread flips to non-zero (with
 * `Atomics.store` + `Atomics.notify`) when a newer navigation supersedes this
 * one. We wait for that notification with `Atomics.waitAsync`, which is
 * event-driven rather than polled. A validation that finishes without being
 * superseded calls `cleanup()`, which wakes our own still-pending wait so it
 * leaves no waiter (and no retained buffer) behind.
 */
function createSupersedeSignal(abortBuffer: SharedArrayBuffer): {
  signal: AbortSignal
  cleanup: () => void
} {
  const controller = new AbortController()
  const flag = new Int32Array(abortBuffer)

  if (Atomics.load(flag, 0) !== 0) {
    controller.abort()
    return { signal: controller.signal, cleanup: () => {} }
  }

  let settled = false
  const wait = Atomics.waitAsync(flag, 0, 0)
  if (wait.async) {
    wait.value.then(() => {
      if (settled) {
        return
      }
      settled = true
      // Woken either by a real supersede or by `cleanup()`; only the former
      // leaves the flag set.
      if (Atomics.load(flag, 0) !== 0) {
        controller.abort()
      }
    })
  } else if (Atomics.load(flag, 0) !== 0) {
    // The flag flipped between the load above and the wait.
    controller.abort()
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (!settled) {
        Atomics.notify(flag, 0)
      }
    },
  }
}

/**
 * Waits out the test-only validation delay, resolving early if the render is
 * superseded. Mirrors the delay in `runWithDevValidationLogging` so scheduler
 * tests observe the same in-flight window on the worker path.
 */
async function applyTestValidationDelay(signal: AbortSignal): Promise<void> {
  const delayMs = Number(process.env.NEXT_TEST_DEV_VALIDATION_DELAY_MS)
  if (!Number.isFinite(delayMs) || delayMs <= 0 || signal.aborted) {
    return
  }

  await new Promise<void>((resolve) => {
    const finishDelay = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', finishDelay)
      resolve()
    }
    const timeout = setTimeout(finishDelay, delayMs)
    signal.addEventListener('abort', finishDelay, { once: true })
  })
}

/**
 * Registers the client reference manifests of the pages that supplied client
 * references to the render being validated, beyond the validated route's own
 * manifest. This thread has its own manifests singleton, which `loadComponents`
 * seeds with only the validated route, so without these the dev-only cross-page
 * lookup in `createProxiedClientReferenceManifest` has no other manifest to
 * search and decoding the transported payload fails. Usually a no-op, since the
 * main thread only records a page when React's I/O tracking actually carried a
 * reference across pages.
 */
async function registerAdditionalClientReferenceManifests(
  distDir: string,
  pages: string[]
): Promise<void> {
  if (pages.length === 0) {
    return
  }

  // Set by `loadComponents`. One server actions manifest covers the whole app,
  // so the pages registered here share the validated route's.
  const serverActionsManifest = getServerActionsManifest()

  await Promise.all(
    pages.map(async (page) => {
      const clientReferenceManifest = await loadClientReferenceManifestForPage(
        distDir,
        page
      )

      if (clientReferenceManifest) {
        setManifestsSingleton({
          page,
          clientReferenceManifest,
          serverActionsManifest,
        })
      }
    })
  )
}

declare const __turbopack_server_hmr_apply__:
  | ((runtimeRoot: string, update: NodeJsPartialHmrUpdate) => void)
  | undefined

/**
 * What this thread did with a forwarded HMR update.
 *
 * `no-runtime` is not a failure: no runtime the update routes to had been
 * loaded here, so there was nothing to patch, and whatever loads that route
 * later reads the updated chunk from disk.
 */
export type HmrApplyOutcome = 'applied' | 'no-runtime' | 'failed'

/**
 * Applies a server HMR update to this thread's module registry, mirroring the
 * apply the dev server performed on its own.
 *
 * Turbopack's Node.js runtime registers the apply machinery per isolate (see
 * `dev-nodejs.ts`), and `loadComponents` evaluates that runtime here, so this
 * thread patches the same modules the dev server does. The apply also leaves
 * the updated module's inline source map in this thread's Node.js cache, which
 * is what makes a stack frame in that module source-mappable here.
 */
export async function applyHmrUpdate(
  update: NodeJsPartialHmrUpdate
): Promise<HmrApplyOutcome> {
  if (typeof __turbopack_server_hmr_apply__ !== 'function') {
    return 'no-runtime'
  }

  const runtimeRoots = new Set<string>()
  for (const entry of globalThis.__turbopack_server_hmr_handlers__?.values() ??
    []) {
    runtimeRoots.add(entry.runtimeRoot)
  }
  if (runtimeRoots.size === 0) {
    return 'no-runtime'
  }

  try {
    for (const runtimeRoot of runtimeRoots) {
      __turbopack_server_hmr_apply__(runtimeRoot, update)
    }
  } catch {
    // The dev server responds to the same failure by re-evaluating every
    // module from disk. This thread cannot be repaired in place either, so the
    // caller drops it.
    return 'failed'
  }

  return 'applied'
}

/**
 * Clears the same caches the dev server cleared, for the same paths.
 *
 * `evictModules` follows the dev server's own split: an applied update patches
 * modules in place and clears only the manifest cache for the updated chunks,
 * while a recompile evicts `require.cache` as well. This thread follows both,
 * so its module state stays the dev server's module state.
 */
export async function invalidateCaches(
  filePaths: string[],
  evictModules: boolean
): Promise<void> {
  if (evictModules) {
    deleteCache(filePaths)
    return
  }

  for (const filePath of filePaths) {
    clearManifestCache(filePath)
  }
}

/**
 * Runs the dev instant/static-shell validation passes off the main thread.
 * Reloads the route's compiled module, then delegates the whole validation to
 * that module via `ComponentMod.routeModule.runValidationInDev`, so every
 * render (flight re-encodes and client prerenders) runs inside the app-page
 * bundle's single React instance. Logs any returned errors to the worker's
 * stderr with source-mapped code frames, then encodes them as RSC Flight bytes
 * for the main thread to forward to the dev overlay. Returns `null` when
 * validation was superseded or produced no errors.
 */
export async function runDevValidation(
  message: DevValidationWorkerMessage,
  abortBuffer: SharedArrayBuffer
): Promise<DevValidationWorkerResult> {
  // Load the native SWC bindings and wire the code-frame renderer so the errors
  // logged below render with a source-mapped code frame, matching the
  // in-process dev output (the E2E tests snapshot the CLI text between the
  // validation markers). The `build/swc` graph these pull in is bundled as a
  // runtime external (see `next-runtime.webpack-config.js`), so it resolves
  // from the installed `next/dist` tree rather than being compiled into this
  // worker bundle, the same way the unbundled build worker loads it.
  await installBindings()
  installCodeFrameSupport()
  setBundlerFindSourceMapImplementation(
    createDiskSourceMapLookup(message.distDir)
  )
  setHttpClientAndAgentOptions({
    httpAgentOptions: message.nextConfigSerializable.httpAgentOptions,
  })

  // Populates the manifests singleton for the route via `setManifestsSingleton`
  // inside `loadComponents`, exactly as a real request does. The pool tears the
  // worker down on HMR / route recompile so the next validation reloads from a
  // clean require cache.
  const { ComponentMod } = await loadComponents<AppPageModule>({
    distDir: message.distDir,
    page: message.page,
    isAppPath: true,
    isDev: true,
    sriEnabled: false,
    needsManifestsForLegacyReasons: true,
  })

  await registerAdditionalClientReferenceManifests(
    message.distDir,
    message.additionalClientReferenceManifestPages
  )

  const { signal, cleanup } = createSupersedeSignal(abortBuffer)

  if (isTestLoggingEnabled) {
    console.log(
      formatValidationEvent({
        type: 'validation_start',
        requestId: message.requestId,
        url: message.request.urlPathname + message.request.urlSearch,
        responseFinished: message.responseFinished,
      })
    )
  }

  try {
    if (isTestLoggingEnabled) {
      await applyTestValidationDelay(signal)
    }

    if (signal.aborted) {
      return null
    }

    // Crossing into the app-page bundle: the entire validation runs there, so
    // the client prerenders use the same React the user's client components
    // resolve through `ComponentMod`.
    const validationErrors = await ComponentMod.routeModule.runValidationInDev(
      ComponentMod,
      message,
      signal
    )

    if (validationErrors === undefined || signal.aborted) {
      return null
    }

    const errors: Error[] = []
    for (const validationError of validationErrors) {
      // Log to the worker's stderr; `node-environment` +
      // `installCodeFrameSupport` render the source-mapped stack and code frame
      // there, matching the in-process CLI output.
      console.error(validationError)
      if (validationError instanceof Error) {
        errors.push(validationError)
      }
    }

    if (errors.length === 0) {
      return null
    }

    return await serializeValidationErrorsToFlight(ComponentMod, errors)
  } finally {
    cleanup()
    if (isTestLoggingEnabled) {
      console.log(
        formatValidationEvent({
          type: signal.aborted ? 'validation_aborted' : 'validation_end',
          requestId: message.requestId,
          url: message.request.urlPathname + message.request.urlSearch,
        })
      )
    }
  }
}

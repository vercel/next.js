import type { Socket } from 'net'
import { mkdir, writeFile } from 'fs/promises'
import { realpathSync } from 'fs'
import * as inspector from 'inspector'
import { join, extname, relative, isAbsolute, sep } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

import ws from 'next/dist/compiled/ws'

import type { OutputState } from '../../build/output/store'
import { store as consoleStore } from '../../build/output/store'
import type {
  CompilationError,
  HmrMessageSentToBrowser,
  NextJsHotReloaderInterface,
  ReloadPageMessage,
  SyncMessage,
  TurbopackConnectedMessage,
} from './hot-reloader-types'
import { HMR_MESSAGE_SENT_TO_BROWSER } from './hot-reloader-types'
import { recursiveDeleteSyncWithAsyncRetries } from '../../lib/recursive-delete'
import type {
  Update as TurbopackUpdate,
  Endpoint,
  WrittenEndpoint,
  TurbopackResult,
  Project,
  Entrypoints,
  NodeJsHmrUpdate,
  NodeJsPartialHmrUpdate,
} from '../../build/swc/types'
import { createDefineEnv, getBindingsSync } from '../../build/swc'
import * as Log from '../../build/output/log'
import { BLOCKED_PAGES } from '../../shared/lib/constants'
import {
  getOverlayMiddleware,
  getSourceMapMiddleware,
  getOriginalStackFrames,
} from './middleware-turbopack'
import { PageNotFoundError } from '../../shared/lib/utils'
import { debounce } from '../utils'
import { clearManifestCache } from '../load-manifest.external'
import { deleteCache } from './require-cache'
import {
  dropDevValidationWorker,
  mirrorModuleStateToDevValidationWorker,
} from './dev-validation-worker-pool'
import {
  clearAllModuleContexts,
  clearModuleContext,
} from '../lib/render-server'
import { denormalizePagePath } from '../../shared/lib/page-path/denormalize-page-path'
import { trace } from '../../trace'
import {
  AssetMapper,
  type ChangeSubscriptions,
  type ClientState,
  handleEntrypoints,
  handlePagesErrorRoute,
  handleRouteType,
  hasEntrypointForKey,
  msToNs,
  type ReadyIds,
  type SendHmr,
  type StartBuilding,
  processTopLevelIssues,
  printNonFatalIssue,
  normalizedPageToTurbopackStructureRoute,
  type StartChangeSubscription,
} from './turbopack-utils'
import {
  propagateServerField,
  type ServerFields,
  type SetupOpts,
} from '../lib/router-utils/setup-dev-bundler'
import { TurbopackManifestLoader } from '../../shared/lib/turbopack/manifest-loader'
import { findPagePathData } from './on-demand-entry-handler'
import type { RouteDefinition } from '../route-definitions/route-definition'
import {
  type EntryKey,
  getEntryKey,
  splitEntryKey,
} from '../../shared/lib/turbopack/entry-key'
import {
  createBinaryHmrMessageData,
  FAST_REFRESH_RUNTIME_RELOAD,
} from './messages'
import { generateEncryptionKeyBase64 } from '../app-render/encryption-utils-server'
import { isAppPageRouteDefinition } from '../route-definitions/app-page-route-definition'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import type { ModernSourceMapPayload } from '../lib/source-maps'
import { isDeferredEntry } from '../../build/entries'
import { isMetadataRouteFile } from '../../lib/metadata/is-metadata-route'
import { setBundlerFindSourceMapImplementation } from '../patch-error-inspect'
import { setBundlerFindSourceMapURLImplementation } from '../lib/source-maps'
import {
  formatIssue,
  isFileSystemCacheEnabledForDev,
  isWellKnownError,
  ModuleBuildError,
  processIssues,
  renderStyledStringToErrorAnsi,
  type EntryIssuesMap,
  type IssuesMap,
  type TopLevelIssuesMap,
} from '../../shared/lib/turbopack/utils'
import { getDevOverlayFontMiddleware } from '../../next-devtools/server/font/get-dev-overlay-font-middleware'
import { devIndicatorServerState } from './dev-indicator-server-state'
import { getDisableDevIndicatorMiddleware } from '../../next-devtools/server/dev-indicator-middleware'
import { getRestartDevServerMiddleware } from '../../next-devtools/server/restart-dev-server-middleware'
import { backgroundLogCompilationEvents } from '../../shared/lib/turbopack/compilation-events'
import { DeferredEmit } from '../../shared/lib/turbopack/deferred-emit'
import { getSupportedBrowsers } from '../../build/get-supported-browsers'
import { printBuildErrors } from '../../build/print-build-errors'
import { receiveBrowserLogsTurbopack } from './browser-logs/receive-logs'
import { normalizePath } from '../../lib/normalize-path'
import { seedTurbopackCacheIfNeeded } from '../../lib/turbopack-cache-seed'
import {
  devToolsConfigMiddleware,
  getDevToolsConfig,
} from '../../next-devtools/server/devtools-config-middleware'
import { getAttachNodejsDebuggerMiddleware } from '../../next-devtools/server/attach-nodejs-debugger-middleware'
import {
  connectReactDebugChannel,
  connectReactDebugChannelForHtmlRequest,
  deleteReactDebugChannelForHtmlRequest,
  setReactDebugChannelForHtmlRequest,
} from './debug-channel'
import {
  getVersionInfo,
  matchNextPageBundleRequest,
} from './hot-reloader-shared-utils'
import { getMcpMiddleware } from '../mcp/get-mcp-middleware'
import { formatCompilationIssues } from '../mcp/tools/utils/format-compilation-issues'
import {
  getRequestInsightsSnapshot,
  isRequestInsightsEnabled,
} from '../lib/trace/request-insights'
import { resolvePathToRoute } from '../mcp/tools/utils/resolve-path-to-route'
import { handleErrorStateResponse } from '../mcp/tools/get-errors'
import { handlePageMetadataResponse } from '../mcp/tools/get-page-metadata'
import { setStackFrameResolver } from '../mcp/tools/utils/format-errors'
import { recordMcpTelemetry } from '../mcp/mcp-telemetry-tracker'
import { getFileLogger } from './browser-logs/file-logger'
import type { ServerCacheStatus } from '../../next-devtools/dev-overlay/cache-indicator'
import type { Lockfile } from '../../build/lockfile'
import {
  sendSerializedErrorsToClient,
  sendSerializedErrorsToClientForHtmlRequest,
  setErrorsRscStreamForHtmlRequest,
} from './serialized-errors'

const wsServer = new ws.Server({ noServer: true })
const isTestMode = !!(
  process.env.NEXT_TEST_MODE ||
  process.env.__NEXT_TEST_MODE ||
  process.env.DEBUG
)

const sessionId = Math.floor(Number.MAX_SAFE_INTEGER * Math.random())

/** Output directory (relative to `distDir`) of server-HMR-managed chunks. */
const SERVER_HMR_CHUNKS_DIR = join('server', 'chunks')

const TURBOPACK_OUTPUT_DIRS = [
  join('static', 'chunks'),
  join('static', 'media'),
  join('static', 'service-worker'),
  join('server', 'app'),
  join('server', 'pages'),
  SERVER_HMR_CHUNKS_DIR,
  join('server', 'assets'),
  join('server', 'edge', 'chunks'),
  join('server', 'edge', 'assets'),
  join('server', 'middleware'),
  join('server', 'instrumentation'),
]

const RETAINED_OUTPUT_PATHS = new Set([
  'cache',
  'lock',
  ...TURBOPACK_OUTPUT_DIRS,
])

declare const __next__clear_chunk_cache__: (() => void) | null | undefined

declare const __turbopack_server_hmr_apply__:
  | ((update: NodeJsPartialHmrUpdate) => void)
  | undefined

declare global {
  /**
   * Sync with  `turbopack/crates/turbopack-ecmascript-runtime/js/src/nodejs/runtime/nodejs-globals.d.ts`.
   */
  var __turbopack_server_hmr_handlers__: Map<string, unknown> | undefined
}

/**
 * Collects the output chunk paths touched by a partial HMR update. Both
 * single-chunk `EcmascriptMergedUpdate`s and `ChunkListUpdate`s (which nest
 * per-chunk deltas inside `merged`) are flattened so the manifest cache can be
 * invalidated for every affected chunk after a successful apply.
 */
function collectUpdatedChunkPaths(
  instruction: NodeJsPartialHmrUpdate['instruction']
): string[] {
  const paths = new Set<string>()
  if (instruction.type === 'EcmascriptMergedUpdate') {
    for (const chunkPath of Object.keys(instruction.chunks ?? {})) {
      paths.add(chunkPath)
    }
  } else if (instruction.type === 'ChunkListUpdate') {
    for (const chunkPath of Object.keys(instruction.chunks ?? {})) {
      paths.add(chunkPath)
    }
    for (const merged of instruction.merged ?? []) {
      for (const chunkPath of Object.keys(merged.chunks ?? {})) {
        paths.add(chunkPath)
      }
    }
  } else {
    throw new Error(
      `[Server HMR] unreachable: unknown HMR instruction type ${(instruction as { type: string }).type}`
    )
  }
  return Array.from(paths)
}

function setupServerHmr(
  project: Project,
  {
    reEvaluateAllModulesExpensive,
    onApplied,
  }: {
    reEvaluateAllModulesExpensive: () => void | Promise<void>
    onApplied: (chunkPaths: string[]) => void | Promise<void>
  }
) {
  async function runSubscription() {
    const subscription = project.serverHmrEvents()

    // Subscribing immediately emits one event describing the current state.
    // There's no previous state to diff it against, so it never carries anything
    // to apply. Drop it; real updates start with the second event.
    await subscription.next()

    for await (const result of subscription) {
      const update = result as NodeJsHmrUpdate

      // A 'restart' from the wire protocol means the update can't be applied
      // incrementally, so we must fully re-evaluate all chunks from disk. This
      // clears the module cache and notifies browsers to refetch RSC.
      const requiresFullReEvaluation = update.type === 'restart'
      if (requiresFullReEvaluation) {
        await reEvaluateAllModulesExpensive()
        continue
      }

      if (update.type !== 'partial') {
        continue
      }

      // `EcmascriptMergedUpdate` is the only instruction the Node.js runtime
      // knows how to apply; `ChunkListUpdate` is browser-only. Anything else is
      // unknown to us, so ignore it rather than evicting the module cache.
      const instruction = update.instruction
      if (
        !instruction ||
        (instruction.type !== 'EcmascriptMergedUpdate' &&
          instruction.type !== 'ChunkListUpdate')
      ) {
        throw new Error(
          `[Server HMR] unreachable: unexpected update instruction type ${(instruction as { type: string }).type}`
        )
      }

      // No handler registered yet (before first request, or right after
      // reEvaluateAllModulesExpensive()) — nothing live to update, so skip
      // until the next request.
      const handlers = globalThis.__turbopack_server_hmr_handlers__
      if (!handlers || handlers.size === 0) {
        continue
      }

      if (typeof __turbopack_server_hmr_apply__ === 'function') {
        try {
          __turbopack_server_hmr_apply__(update)
          // The validation worker keeps its own copy of the module graph, and
          // applies the same update to it.
          mirrorModuleStateToDevValidationWorker({ type: 'apply', update })
        } catch {
          // A matching runtime tried the apply and threw. Evict require.cache
          // so the next request loads fresh, then skip onApplied. (A no-match
          // update is a no-op and does not throw.)
          await reEvaluateAllModulesExpensive()
          continue
        }

        const updatedChunkPaths = collectUpdatedChunkPaths(instruction)
        // An empty partial only advances the version state (e.g. the seed
        // transition or a new endpoint); nothing changed on disk, so don't
        // invalidate manifests or ping browsers to refetch RSC.
        if (updatedChunkPaths.length > 0) {
          await onApplied(updatedChunkPaths)
        }
      } else {
        await reEvaluateAllModulesExpensive()
      }
    }
  }

  // Start listening for changes in background. Re-subscribe on error so
  // server Fast Refresh continues working for the rest of the dev session.
  // The delay keeps a persistently-failing subscription (which throws on the
  // initial read) from hot-looping through reEvaluateAllModulesExpensive().
  ;(async () => {
    for (;;) {
      try {
        await runSubscription()
        return
      } catch (err) {
        console.error('[Server HMR] Subscription error, resubscribing:', err)
        await reEvaluateAllModulesExpensive()
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
  })()
}

function getSourceMapFromTurbopack(
  project: Project,
  sourceURL: string
): ModernSourceMapPayload | undefined {
  let sourceMapJson: string | null = null

  try {
    sourceMapJson = project.getSourceMapSync(sourceURL)
  } catch (err) {}

  if (sourceMapJson === null) {
    return undefined
  } else {
    return JSON.parse(sourceMapJson)
  }
}

function getSourceMapURLFromTurbopack(
  distDir: string,
  scriptNameOrSourceURL: string
): string | null {
  // React invokes this with the raw stack-frame filename, which arrives
  // either as an absolute filesystem path or as a `file:` URL. Anything else
  // (`file:` URLs with a query are eval'd server HMR modules carrying inline
  // source maps, `webpack-internal://`, `node:internal/...`, `<anonymous>`,
  // ...) is not something we have an emitted source map for.
  let scriptPath = scriptNameOrSourceURL
  if (scriptNameOrSourceURL.startsWith('file://')) {
    if (scriptNameOrSourceURL.includes('?')) {
      return null
    }
    try {
      scriptPath = fileURLToPath(scriptNameOrSourceURL)
    } catch {
      return null
    }
  }
  if (!isAbsolute(scriptPath)) {
    return null
  }

  // Only chunks emitted into `distDir` have an on-disk source map to point at.
  const relativePath = relative(distDir, scriptPath)
  if (
    relativePath.startsWith('..') ||
    // On Windows an absolute path on a different drive is returned unchanged
    // rather than as a `..`-prefixed relative path.
    isAbsolute(relativePath)
  ) {
    return null
  }

  // The emitted source map lives next to its chunk with a `.map` suffix (see
  // `SourceMapAsset::path`). Encode through `pathToFileURL` so any special
  // characters in the path are escaped into a well-formed `file:` URL.
  return pathToFileURL(scriptPath + '.map').href
}

export async function createHotReloaderTurbopack(
  opts: SetupOpts & { isSrcDir: boolean },
  serverFields: ServerFields,
  distDir: string,
  resetFetch: () => void,
  lockfile: Lockfile | undefined,
  serverFastRefresh?: boolean
): Promise<NextJsHotReloaderInterface> {
  const dev = true
  const buildId = 'development'
  const { nextConfig, dir: projectPath } = opts

  const bindings = getBindingsSync()

  // Turbopack requires native bindings and cannot run with WASM bindings.
  // Detect this early and give a clear, actionable error message.
  if (bindings.isWasm) {
    throw new Error(
      `Turbopack is not supported on this platform (${process.platform}/${process.arch}) because native bindings are not available. ` +
        `Only WebAssembly (WASM) bindings were loaded, and Turbopack requires native bindings.\n\n` +
        `To use Next.js on this platform, use Webpack instead:\n` +
        `  next dev --webpack\n\n` +
        `For more information, see: https://nextjs.org/docs/app/api-reference/turbopack#supported-platforms`
    )
  }

  // This must finish before Turbopack records any writes. Once turbo-tasks has
  // recorded a write effect, it dedups by hash without checking the file.
  await recursiveDeleteSyncWithAsyncRetries(distDir, RETAINED_OUTPUT_PATHS)
  await Promise.all(
    TURBOPACK_OUTPUT_DIRS.map((subDir) =>
      recursiveDeleteSyncWithAsyncRetries(
        join(distDir, subDir),
        undefined,
        nextConfig.experimental.turbopackStaleOutputMaxAge
      )
    )
  )

  // For the debugging purpose, check if createNext or equivalent next instance setup in test cases
  // works correctly. Normally `run-test` hides output so only will be visible when `--debug` flag is used.
  if (isTestMode) {
    ;(require('console') as typeof import('console')).log(
      'Creating turbopack project',
      {
        dir: projectPath,
        testMode: isTestMode,
      }
    )
  }

  const hasRewrites =
    opts.fsChecker.rewrites.afterFiles.length > 0 ||
    opts.fsChecker.rewrites.beforeFiles.length > 0 ||
    opts.fsChecker.rewrites.fallback.length > 0

  const hotReloaderSpan = trace('hot-reloader', undefined, {
    version: process.env.__NEXT_VERSION as string,
  })
  // Ensure the hotReloaderSpan is flushed immediately as it's the parentSpan for all processing
  // of the current `next dev` invocation.
  hotReloaderSpan.stop()

  // Initialize log monitor for file logging
  // Enable logging by default in development mode
  const mcpServerEnabled = !!nextConfig.experimental.mcpServer
  const fileLogger = getFileLogger()
  fileLogger.initialize(distDir, mcpServerEnabled)

  const encryptionKey = await generateEncryptionKeyBase64({
    isBuild: false,
    distDir,
  })

  // TODO: Implement
  let clientRouterFilters: any
  if (nextConfig.experimental.clientRouterFilter) {
    // TODO this need to be set correctly for filesystem cache to work
  }

  const supportedBrowsers = getSupportedBrowsers(projectPath, dev)
  const currentNodeJsVersion = process.versions.node

  const rootPath =
    opts.nextConfig.turbopack?.root ||
    opts.nextConfig.outputFileTracingRoot ||
    projectPath

  if (nextConfig.experimental.turbopackSeedCacheFromWorktree) {
    seedTurbopackCacheIfNeeded({
      projectDir: projectPath,
      distDir,
    })
  }

  const project = await bindings.turbo.createProject(
    {
      rootPath,
      projectPath: normalizePath(relative(rootPath, projectPath) || '.'),
      distDir,
      nextConfig: opts.nextConfig,
      watch: {
        enable: dev,
        pollIntervalMs: nextConfig.watchOptions?.pollIntervalMs,
      },
      dev,
      env: process.env as Record<string, string>,
      defineEnv: createDefineEnv({
        isTurbopack: true,
        clientRouterFilters,
        config: nextConfig,
        dev,
        distDir,
        projectPath,
        fetchCacheKeyPrefix: opts.nextConfig.experimental.fetchCacheKeyPrefix,
        hasRewrites,
        // TODO: Implement
        middlewareMatchers: undefined,
        rewrites: opts.fsChecker.rewrites,
      }),
      buildId,
      encryptionKey,
      previewProps: opts.fsChecker.previewProps,
      browserslistQuery: supportedBrowsers.join(', '),
      noMangling: false,
      writeRoutesHashesManifest: false,
      currentNodeJsVersion,
      isPersistentCachingEnabled: isFileSystemCacheEnabledForDev(
        opts.nextConfig
      ),
      nextVersion: process.env.__NEXT_VERSION as string,
      serverHmr: serverFastRefresh,
    },
    {
      turbopackMemoryEviction:
        opts.nextConfig.experimental.turbopackMemoryEvictionMode,
      isShortSession: false,
    }
  )
  backgroundLogCompilationEvents(project, {
    eventTypes: [
      'StartupCacheInvalidationEvent',
      'TimingEvent',
      'SlowFilesystemEvent',
      'FilesystemSettlingEvent',
      'TraceEvent',
    ],
    parentSpan: hotReloaderSpan,
  })
  setBundlerFindSourceMapImplementation(
    getSourceMapFromTurbopack.bind(null, project)
  )

  let canonicalDistDir = distDir
  try {
    canonicalDistDir = realpathSync(distDir)
  } catch {}
  setBundlerFindSourceMapURLImplementation(
    getSourceMapURLFromTurbopack.bind(null, canonicalDistDir)
  )

  // Set up code frame renderer using native bindings
  const { installCodeFrameSupport } =
    require('../lib/install-code-frame') as typeof import('../lib/install-code-frame')
  installCodeFrameSupport()

  opts.onDevServerCleanup?.(async () => {
    setBundlerFindSourceMapImplementation(() => undefined)
    setBundlerFindSourceMapURLImplementation(() => null)
    await project.onExit()
    await lockfile?.unlock()
  })
  const entrypointsSubscription = project.entrypointsSubscribe()

  const currentWrittenEntrypoints: Map<EntryKey, WrittenEndpoint> = new Map()
  const currentEntrypoints: Entrypoints = {
    global: {
      app: undefined,
      document: undefined,
      error: undefined,

      middleware: undefined,
      instrumentation: undefined,
    },

    page: new Map(),
    app: new Map(),
  }

  const currentTopLevelIssues: TopLevelIssuesMap = new Map()
  const currentEntryIssues: EntryIssuesMap = new Map()

  const manifestLoader = new TurbopackManifestLoader({
    buildId,
    distDir,
    encryptionKey,
    dev: true,
    sriEnabled: false,
  })

  // Dev specific
  const changeSubscriptions: ChangeSubscriptions = new Map()
  const serverPathState = new Map<string, string>()
  const readyIds: ReadyIds = new Set()
  let currentEntriesHandlingResolve: ((value?: unknown) => void) | undefined
  let currentEntriesHandling = new Promise(
    (resolve) => (currentEntriesHandlingResolve = resolve)
  )

  const assetMapper = new AssetMapper()

  // Deferred entries state management
  const deferredEntriesConfig = nextConfig.experimental.deferredEntries
  const hasDeferredEntriesConfig =
    deferredEntriesConfig && deferredEntriesConfig.length > 0
  let onBeforeDeferredEntriesCalled = false
  let onBeforeDeferredEntriesPromise: Promise<void> | null = null
  // Track non-deferred entries that are currently being built
  const nonDeferredBuildingEntries: Set<string> = new Set()

  // Function to wait for all non-deferred entries to be built
  async function waitForNonDeferredEntries(): Promise<void> {
    return new Promise<void>((resolve) => {
      const checkEntries = () => {
        // Check if there are any non-deferred entries that are still building
        if (nonDeferredBuildingEntries.size === 0) {
          resolve()
        } else {
          // Check again after a short delay
          setTimeout(checkEntries, 100)
        }
      }
      checkEntries()
    })
  }

  // Function to handle deferred entry processing
  async function processDeferredEntry(): Promise<void> {
    if (!hasDeferredEntriesConfig) return

    // Wait for all non-deferred entries to be built
    await waitForNonDeferredEntries()

    // Call the onBeforeDeferredEntries callback once
    if (!onBeforeDeferredEntriesCalled) {
      onBeforeDeferredEntriesCalled = true

      if (nextConfig.experimental.onBeforeDeferredEntries) {
        if (!onBeforeDeferredEntriesPromise) {
          onBeforeDeferredEntriesPromise =
            nextConfig.experimental.onBeforeDeferredEntries()
        }
        await onBeforeDeferredEntriesPromise
      }
    } else if (onBeforeDeferredEntriesPromise) {
      // Wait for any in-progress callback
      await onBeforeDeferredEntriesPromise
    }
  }

  // Track whether HMR is pending - used to call callback once after HMR settles
  let hmrPendingDeferredCallback = false

  // Debounced function to call onBeforeDeferredEntries after HMR
  // This prevents rapid-fire calls when turbopack fires many update events
  // Use 500ms debounce to ensure all rapid updates are batched together
  const callOnBeforeDeferredEntriesAfterHMR = debounce(() => {
    // Only call if HMR triggered a need for the callback
    if (hasDeferredEntriesConfig && hmrPendingDeferredCallback) {
      hmrPendingDeferredCallback = false
      onBeforeDeferredEntriesCalled = true
      if (nextConfig.experimental.onBeforeDeferredEntries) {
        onBeforeDeferredEntriesPromise =
          nextConfig.experimental.onBeforeDeferredEntries()
      }
    }
  }, 500)

  function clearRequireCache(
    key: EntryKey,
    writtenEndpoint: WrittenEndpoint,
    {
      force,
    }: {
      // Always clear the cache, don't check if files have changed
      force?: boolean
    } = {}
  ): boolean {
    if (force) {
      for (const { path, contentHash } of writtenEndpoint.serverPaths) {
        // We ignore source maps
        if (path.endsWith('.map')) continue
        const localKey = `${key}:${path}`
        serverPathState.set(localKey, contentHash)
        serverPathState.set(path, contentHash)
      }
    } else {
      // Figure out if the server files have changed
      let hasChange = false
      const currentPaths = new Set<string>()
      for (const { path, contentHash } of writtenEndpoint.serverPaths) {
        // We ignore source maps
        if (path.endsWith('.map')) continue
        currentPaths.add(path)
        const localKey = `${key}:${path}`
        const localHash = serverPathState.get(localKey)
        const globalHash = serverPathState.get(path)
        if (
          (localHash && localHash !== contentHash) ||
          (globalHash && globalHash !== contentHash)
        ) {
          hasChange = true
          serverPathState.set(localKey, contentHash)
          serverPathState.set(path, contentHash)
        } else {
          if (!localHash) {
            serverPathState.set(localKey, contentHash)
          }
          if (!globalHash) {
            serverPathState.set(path, contentHash)
          }
        }
      }

      const localKeyPrefix = `${key}:`
      for (const pathKey of serverPathState.keys()) {
        if (
          pathKey.startsWith(localKeyPrefix) &&
          !currentPaths.has(pathKey.slice(localKeyPrefix.length))
        ) {
          serverPathState.delete(pathKey)
          hasChange = true
        }
      }

      if (!hasChange) {
        return false
      }
    }

    // Edge does not participate in server HMR.
    if (writtenEndpoint.type === 'edge') {
      void clearAllModuleContexts()
    }

    const serverPaths = writtenEndpoint.serverPaths.map(({ path: p }) =>
      join(distDir, p)
    )

    const { type: entryType } = splitEntryKey(key)

    // Server HMR applies to App Router entries built with the Turbopack Node.js
    // runtime: app pages and route handlers (including metadata routes). Edge
    // routes, Pages Router pages, and middleware/instrumentation are excluded.
    const usesServerHmr =
      serverFastRefresh &&
      entryType === 'app' &&
      writtenEndpoint.type !== 'edge'

    const serverChunksPrefix = SERVER_HMR_CHUNKS_DIR + sep
    const filesToDelete: string[] = []
    for (const file of serverPaths) {
      clearModuleContext(file)

      const relativePath = relative(distDir, file)
      if (
        // For Pages Router, edge routes, middleware, and any entry not
        // participating in server HMR: clear the sharedCache in
        // evalManifest(), Node.js require.cache, and edge runtime module
        // contexts.
        force ||
        !usesServerHmr ||
        !relativePath.startsWith(serverChunksPrefix)
      ) {
        filesToDelete.push(file)
      }
    }
    deleteCache(filesToDelete)

    // Reset the fetch patch so patchFetch() can re-wrap on the next request.
    if (serverPaths.length > 0) {
      resetFetch()
    }

    // Clear Turbopack's chunk-loading cache so chunks are re-required from disk on
    // the next request.
    //
    // For App Router with server HMR, this is normally skipped as server HMR
    // manages module updates in-place. However, it *is* required when force is `true`
    // (like for .env file or tsconfig changes).
    if (
      (!usesServerHmr || force) &&
      typeof __next__clear_chunk_cache__ === 'function'
    ) {
      __next__clear_chunk_cache__()
    }

    return true
  }

  const buildingIds = new Set()

  const startBuilding: StartBuilding = (id, requestUrl, forceRebuild) => {
    if (!forceRebuild && readyIds.has(id)) {
      return () => {}
    }
    if (buildingIds.size === 0) {
      consoleStore.setState(
        {
          loading: true,
          trigger: id,
          url: requestUrl,
        } as OutputState,
        true
      )
    }
    buildingIds.add(id)
    return function finishBuilding() {
      if (buildingIds.size === 0) {
        return
      }
      readyIds.add(id)
      buildingIds.delete(id)
      if (buildingIds.size === 0) {
        hmrEventHappened = false
        consoleStore.setState(
          {
            loading: false,
          } as OutputState,
          true
        )
      }
    }
  }

  let hmrEventHappened = false
  // A counter identifying the current version of the compiled output, included
  // by `"use cache"` in dev cache keys so that cached entries revalidate after
  // an edit. It advances once per HMR change event (for App Router pages that
  // is an RSC change, which is what a cached render depends on), independent of
  // how many clients are connected. It deliberately does not advance on `BUILT`
  // messages: those are sent per connected client on every compilation, so
  // advancing there would both churn the hash without an edit and fail to
  // advance it at all when no client is connected.
  let hmrHash = 0
  // Undefined until the first entrypoints emission. That one has nothing to
  // compare against, so every route it lists would look added.
  let previousRouteKeys: Set<string> | undefined

  // HACK: Defer sending `building` messages. Turbopack emits a compile pass for every
  // foreground-job cycle, including empty no-op recompiles scheduled by
  // request/render activity that changed no files. This allows us to prevent
  // sending them if we quickly get a `built` message after a `building` message.
  const pendingBuilding = new DeferredEmit()

  const clientsWithoutHtmlRequestId = new Set<ws>()
  const clientsByHtmlRequestId = new Map<string, ws>()
  const cacheStatusesByHtmlRequestId = new Map<string, ServerCacheStatus>()
  const clientStates = new WeakMap<ws, ClientState>()

  function sendToClient(client: ws, message: HmrMessageSentToBrowser) {
    const data =
      typeof message.type === 'number'
        ? createBinaryHmrMessageData(message)
        : JSON.stringify(message)

    client.send(data)
  }

  let updateInProgress = false
  let pendingServerComponentChanges = false

  function sendServerComponentChanges() {
    sendHmr('server-component-changes', {
      type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
    })
  }

  // Each announcement makes every client refetch its page, so an update's
  // changes are announced once, on the update's end.
  function handleServerComponentChanges() {
    if (updateInProgress) {
      pendingServerComponentChanges = true
    } else {
      sendServerComponentChanges()
    }
  }

  function hasCompilationErrors() {
    for (const [, issueMap] of currentEntryIssues) {
      if (
        [...issueMap.values()].filter((i) => i.severity !== 'warning').length >
        0
      ) {
        return true
      }
    }
    return false
  }

  function sendEnqueuedMessages() {
    if (hasCompilationErrors()) {
      // During compilation errors we want to delay the HMR events until errors are fixed
      return
    }

    for (const client of [
      ...clientsWithoutHtmlRequestId,
      ...clientsByHtmlRequestId.values(),
    ]) {
      const state = clientStates.get(client)
      if (!state) {
        continue
      }

      for (const [, issueMap] of state.clientIssues) {
        if (
          [...issueMap.values()].filter((i) => i.severity !== 'warning')
            .length > 0
        ) {
          // During compilation errors we want to delay the HMR events until errors are fixed
          return
        }
      }

      for (const message of state.messages.values()) {
        sendToClient(client, message)
      }
      state.messages.clear()

      if (state.turbopackUpdates.length > 0) {
        sendToClient(client, {
          type: HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_MESSAGE,
          data: state.turbopackUpdates,
        })
        state.turbopackUpdates.length = 0
      }
    }
  }
  const sendEnqueuedMessagesDebounce = debounce(sendEnqueuedMessages, 2)

  const sendHmr: SendHmr = (id: string, message: HmrMessageSentToBrowser) => {
    pendingBuilding.flush()
    for (const client of [
      ...clientsWithoutHtmlRequestId,
      ...clientsByHtmlRequestId.values(),
    ]) {
      clientStates.get(client)?.messages.set(id, message)
    }

    hmrEventHappened = true
    sendEnqueuedMessagesDebounce()
  }

  function sendTurbopackMessage(payload: TurbopackUpdate) {
    // TODO(PACK-2049): For some reason we end up emitting hundreds of issues messages on bigger apps,
    //   a lot of which are duplicates.
    //   They are currently not handled on the client at all, so might as well not send them for now.
    payload.diagnostics = []
    payload.issues = []
    pendingBuilding.flush()

    for (const client of [
      ...clientsWithoutHtmlRequestId,
      ...clientsByHtmlRequestId.values(),
    ]) {
      clientStates.get(client)?.turbopackUpdates.push(payload)
    }

    hmrEventHappened = true
    sendEnqueuedMessagesDebounce()
  }

  async function subscribeToClientChanges(
    key: EntryKey,
    includeIssues: boolean,
    endpoint: Endpoint,
    createMessage: (
      change: TurbopackResult,
      hash: string
    ) => Promise<HmrMessageSentToBrowser> | HmrMessageSentToBrowser | void,
    onError?: (
      error: Error
    ) => Promise<HmrMessageSentToBrowser> | HmrMessageSentToBrowser | void
  ) {
    if (changeSubscriptions.has(key)) {
      return
    }

    const { side } = splitEntryKey(key)

    const changedPromise = endpoint[`${side}Changed`](includeIssues)
    changeSubscriptions.set(key, changedPromise)
    try {
      const changed = await changedPromise

      for await (const change of changed) {
        processIssues(currentEntryIssues, key, change, false, true)
        // TODO: Get an actual content hash from Turbopack.
        const message = await createMessage(change, String(++hmrHash))
        if (message) {
          sendHmr(key, message)
        }
      }
    } catch (e) {
      changeSubscriptions.delete(key)
      const payload = await onError?.(e as Error)
      if (payload) {
        sendHmr(key, payload)
      }
      return
    }
    changeSubscriptions.delete(key)
  }

  async function unsubscribeFromClientChanges(key: EntryKey) {
    const subscription = await changeSubscriptions.get(key)
    if (subscription) {
      await subscription.return?.()
      changeSubscriptions.delete(key)
    }
    currentEntryIssues.delete(key)
  }

  async function subscribeToClientHmrEvents(client: ws, id: string) {
    const key = getEntryKey('assets', 'client', id)
    if (!hasEntrypointForKey(currentEntrypoints, key, assetMapper)) {
      // maybe throw an error / force the client to reload?
      return
    }

    const state = clientStates.get(client)
    if (!state || state.subscriptions.has(id)) {
      return
    }

    const subscription = project!.clientHmrEvents(id)
    state.subscriptions.set(id, subscription)

    // The subscription will always emit once, which is the initial
    // computation. This is not a change, so swallow it.
    try {
      await subscription.next()

      for await (const data of subscription) {
        processIssues(state.clientIssues, key, data, false, true)
        if (data.type !== 'issues') {
          sendTurbopackMessage(data as TurbopackUpdate)
        }
      }
    } catch (e) {
      // The client might be using an HMR session from a previous server, tell them
      // to fully reload the page to resolve the issue. We can't use
      // `hotReloader.send` since that would force every connected client to
      // reload, only this client is out of date.
      const reloadMessage: ReloadPageMessage = {
        type: HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE,
        data: `error in HMR event subscription for ${id}: ${e}`,
      }
      sendToClient(client, reloadMessage)
      client.close()
      return
    }
  }

  function unsubscribeFromClientHmrEvents(client: ws, id: string) {
    const state = clientStates.get(client)
    if (!state) {
      return
    }

    const subscription = state.subscriptions.get(id)
    subscription?.return!()

    const key = getEntryKey('assets', 'client', id)
    state.clientIssues.delete(key)
  }

  async function handleEntrypointsSubscription() {
    for await (const entrypoints of entrypointsSubscription) {
      if (!currentEntriesHandlingResolve) {
        currentEntriesHandling = new Promise(
          // eslint-disable-next-line no-loop-func
          (resolve) => (currentEntriesHandlingResolve = resolve)
        )
      }

      // Always process issues/diagnostics, even if there are no entrypoints yet
      processTopLevelIssues(currentTopLevelIssues, entrypoints)

      // Certain crtical issues prevent any entrypoints from being constructed so return early
      if (!('routes' in entrypoints)) {
        printBuildErrors(entrypoints, true)

        currentEntriesHandlingResolve!()
        currentEntriesHandlingResolve = undefined
        continue
      }

      const routes = entrypoints.routes
      const prevRouteKeys = previousRouteKeys
      const addedRoutes = prevRouteKeys
        ? [...routes.keys()].filter((route) => !prevRouteKeys.has(route))
        : []
      const removedRoutes = prevRouteKeys
        ? [...prevRouteKeys].filter((route) => !routes.has(route))
        : []
      previousRouteKeys = new Set(routes.keys())

      await handleEntrypoints({
        entrypoints: entrypoints as any,

        currentEntrypoints,

        currentEntryIssues,
        manifestLoader,
        devRewrites: opts.fsChecker.rewrites,
        productionRewrites: undefined,
        logErrors: true,

        dev: {
          assetMapper,
          changeSubscriptions,
          clients: [
            ...clientsWithoutHtmlRequestId,
            ...clientsByHtmlRequestId.values(),
          ],
          clientStates,
          serverFields,

          hooks: {
            handleWrittenEndpoint: (id, result, forceDeleteCache) => {
              currentWrittenEntrypoints.set(id, result)
              return clearRequireCache(id, result, { force: forceDeleteCache })
            },
            propagateServerField: propagateServerField.bind(null, opts),
            sendHmr,
            startBuilding,
            subscribeToChanges: subscribeToClientChanges,
            unsubscribeFromChanges: unsubscribeFromClientChanges,
            unsubscribeFromHmrEvents: unsubscribeFromClientHmrEvents,
          },
        },
      })

      if (addedRoutes.length > 0 || removedRoutes.length > 0) {
        // When the list of routes changes a new manifest should be fetched for Pages Router.
        hotReloader.send({
          type: HMR_MESSAGE_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE,
          data: [
            {
              devPagesManifest: true,
            },
          ],
        })
      }

      for (const route of addedRoutes) {
        hotReloader.send({
          type: HMR_MESSAGE_SENT_TO_BROWSER.ADDED_PAGE,
          data: [route],
        })
      }

      for (const route of removedRoutes) {
        hotReloader.send({
          type: HMR_MESSAGE_SENT_TO_BROWSER.REMOVED_PAGE,
          data: [route],
        })
      }

      currentEntriesHandlingResolve!()
      currentEntriesHandlingResolve = undefined
    }
  }

  await mkdir(join(distDir, 'server'), { recursive: true })
  await mkdir(join(distDir, 'static', buildId), { recursive: true })
  await writeFile(
    join(distDir, 'package.json'),
    JSON.stringify(
      {
        type: 'commonjs',
      },
      null,
      2
    )
  )

  const middlewares = [
    getOverlayMiddleware({
      project,
      projectPath,
      isSrcDir: opts.isSrcDir,
    }),
    getSourceMapMiddleware(project),
    getDevOverlayFontMiddleware(),
    getDisableDevIndicatorMiddleware(),
    getRestartDevServerMiddleware({
      telemetry: opts.telemetry,
      turbopackProject: project,
    }),
    devToolsConfigMiddleware({
      distDir,
      sendUpdateSignal: (data) => {
        hotReloader.send({
          type: HMR_MESSAGE_SENT_TO_BROWSER.DEVTOOLS_CONFIG,
          data,
        })
      },
    }),
    getAttachNodejsDebuggerMiddleware(),
    ...(nextConfig.experimental.mcpServer
      ? [
          getMcpMiddleware({
            projectPath,
            distDir,
            nextConfig,
            pagesDir: opts.pagesDir,
            appDir: opts.appDir,
            sendHmrMessage: (message) => hotReloader.send(message),
            getActiveConnectionCount: () =>
              clientsWithoutHtmlRequestId.size + clientsByHtmlRequestId.size,
            getDevServerUrl: () => process.env.__NEXT_PRIVATE_ORIGIN,
            getTurbopackProject: () => project,
            compileRoute: async ({ routeSpecifier, path }) => {
              // Resolve the caller's input to a concrete route specifier. The
              // path-mode branch reuses the dev router's own live route table
              // (opts.fsChecker) — the same one resolve-routes.ts consults on
              // every incoming HTTP request — so first-match ordering and live
              // route updates are inherited for free.
              let page: string
              if (routeSpecifier != null) {
                page = routeSpecifier
              } else if (path != null) {
                const resolved = resolvePathToRoute(path, {
                  appFiles: opts.fsChecker.appFiles,
                  pageFiles: opts.fsChecker.pageFiles,
                  dynamicRoutes: opts.fsChecker.getDynamicRoutes(),
                })
                if ('notFound' in resolved) {
                  const err: NodeJS.ErrnoException = new Error(
                    `no route matched for path "${resolved.pathname}"`
                  )
                  err.code = 'ENOENT'
                  throw err
                }
                page = resolved.routeSpecifier
              } else {
                // Tool handler rejects the empty case; defend the boundary.
                throw new Error(
                  'compileRoute: either routeSpecifier or path is required'
                )
              }

              // ensurePage uses findPagePathData when no definition is provided,
              // which calls normalizePagePath("/") → "/index" then findPageFile
              // looking for "index.tsx" — neither of which matches "page.tsx" in
              // the app dir. Pass a synthetic definition instead.
              //
              // currentEntrypoints.app is keyed by originalName which includes the
              // trailing /page or /route segment (e.g. "/page" for the root route,
              // "/blog/[slug]/page" for a dynamic page). Use normalizeAppPath to
              // strip that suffix and find the entry matching the user-facing route.
              let extraOptions: object | undefined = undefined
              for (const [name] of currentEntrypoints.app) {
                if (normalizeAppPath(name) === page) {
                  extraOptions = {
                    // Synthesize a definition so ensurePage bypasses findPagePathData.
                    // Only page and bundlePath are used from the definition:
                    // - page: the originalName used as the route key for currentEntrypoints lookup
                    // - bundlePath: must start with "app/" to set isInsideAppDir=true
                    definition: {
                      page: name,
                      bundlePath: `app${name}`,
                      filename: '',
                    } as any,
                  }
                  break
                }
              }
              const ensureOpts = {
                page,
                // Compile both server and client bundles, matching what happens
                // on a real page navigation. Client-only compilation isn't a
                // meaningful MCP use case so we don't expose it as a knob.
                clientOnly: false,
                // Skip wiring HMR subscriptions: there is no client to receive
                // updates for routes compiled this way, and these subscriptions
                // are never unsubscribed (see TODOs in handleRouteType).
                subscribeToChanges: false,
                ...extraOptions,
              }

              // Snapshot the current issue maps before compilation so we can
              // identify which entry keys were added or updated by this call.
              // processIssues always creates a new Map() reference, so identity
              // comparison detects changes even for re-compilations.
              const snapshotBefore = new Map(currentEntryIssues)

              // For app-page routes, processIssues is called with throwIssue=true,
              // meaning it throws ModuleBuildError when there are compile errors—but
              // it still writes the issues into currentEntryIssues before throwing.
              // Catch ModuleBuildError so we can read those issues and return them
              // as structured output rather than propagating the throw.
              let moduleBuildError: ModuleBuildError | undefined
              try {
                await hotReloader.ensurePage(ensureOpts)
              } catch (err) {
                if (err instanceof ModuleBuildError) {
                  moduleBuildError = err
                } else {
                  throw err
                }
              }

              const rawIssues = []
              for (const [key, issueMap] of currentEntryIssues) {
                if (snapshotBefore.get(key) !== issueMap) {
                  rawIssues.push(...issueMap.values())
                }
              }

              // If ensurePage threw ModuleBuildError but we found no new issues in
              // the map (shouldn't happen, but be safe), re-surface the original
              // error so its message and stack are preserved.
              if (moduleBuildError && rawIssues.length === 0) {
                throw moduleBuildError
              }

              return {
                routeSpecifier: page,
                issues: formatCompilationIssues(rawIssues),
              }
            },
          }),
        ]
      : []),
  ]

  setStackFrameResolver(async (request) => {
    return getOriginalStackFrames({
      project,
      projectPath,
      isServer: request.isServer,
      isEdgeServer: request.isEdgeServer,
      isAppDirectory: request.isAppDirectory,
      frames: request.frames,
    })
  })

  let versionInfoCached: ReturnType<typeof getVersionInfo> | undefined
  // This fetch, even though not awaited, is not kicked off eagerly because the first `fetch()` in
  // Node.js adds roughly 20ms main-thread blocking to load the SSL certificate cache
  // We don't want that blocking time to be in the hot path for the `ready in` logging.
  // Instead, the fetch is kicked off lazily when the first `getVersionInfoCached()` is called.
  const getVersionInfoCached = (): ReturnType<typeof getVersionInfo> => {
    if (!versionInfoCached) {
      versionInfoCached = getVersionInfo()
    }
    return versionInfoCached
  }

  let devtoolsFrontendUrl: string | undefined
  const inspectorURLRaw = inspector.url()
  if (inspectorURLRaw !== undefined) {
    const inspectorURL = new URL(inspectorURLRaw)

    let debugInfo
    try {
      const debugInfoList = await fetch(
        `http://${inspectorURL.host}/json/list`
      ).then((res) => res.json())
      debugInfo = debugInfoList[0]
    } catch {}
    if (debugInfo) {
      devtoolsFrontendUrl = debugInfo.devtoolsFrontendUrl
    }
  }

  const hotReloader: NextJsHotReloaderInterface = {
    turbopackProject: project,
    activeWebpackConfigs: undefined,
    serverStats: null,
    edgeServerStats: null,
    async run(req, res, _parsedUrl) {
      // intercept page chunks request and ensure them with turbopack
      if (req.url?.startsWith('/_next/static/chunks/pages/')) {
        const params = matchNextPageBundleRequest(req.url)

        if (params) {
          const decodedPagePath = `/${params.path
            .map((param: string) => decodeURIComponent(param))
            .join('/')}`

          const denormalizedPagePath = denormalizePagePath(decodedPagePath)

          await hotReloader
            .ensurePage({
              page: denormalizedPagePath,
              clientOnly: false,
              definition: undefined,
              url: req.url,
            })
            .catch(console.error)
        }
      }

      for (const middleware of middlewares) {
        let calledNext = false

        await middleware(req, res, () => {
          calledNext = true
        })

        if (!calledNext) {
          return { finished: true }
        }
      }

      // Request was not finished.
      return { finished: undefined }
    },

    // TODO: Figure out if socket type can match the NextJsHotReloaderInterface
    onHMR(req, socket: Socket, head, onUpgrade) {
      wsServer.handleUpgrade(req, socket, head, (client) => {
        const clientIssues: EntryIssuesMap = new Map()
        const subscriptions: Map<string, AsyncIterator<any>> = new Map()

        const htmlRequestId = req.url
          ? new URL(req.url, 'http://n').searchParams.get('id')
          : null

        // Clients with a request ID are inferred App Router clients. If Cache
        // Components is not enabled, we consider those legacy clients. Pages
        // Router clients are also considered legacy clients. TODO: Maybe mark
        // clients as App Router / Pages Router clients explicitly, instead of
        // inferring it from the presence of a request ID.
        if (htmlRequestId) {
          clientsByHtmlRequestId.set(htmlRequestId, client)
          const enableCacheComponents = nextConfig.cacheComponents
          if (enableCacheComponents) {
            onUpgrade(client, { isLegacyClient: false })
            const cacheStatus = cacheStatusesByHtmlRequestId.get(htmlRequestId)
            if (cacheStatus !== undefined) {
              sendToClient(client, {
                type: HMR_MESSAGE_SENT_TO_BROWSER.CACHE_INDICATOR,
                state: cacheStatus,
              })
              cacheStatusesByHtmlRequestId.delete(htmlRequestId)
            }
          } else {
            onUpgrade(client, { isLegacyClient: true })
          }

          connectReactDebugChannelForHtmlRequest(
            htmlRequestId,
            sendToClient.bind(null, client)
          )

          sendSerializedErrorsToClientForHtmlRequest(
            htmlRequestId,
            sendToClient.bind(null, client)
          )
        } else {
          clientsWithoutHtmlRequestId.add(client)
          onUpgrade(client, { isLegacyClient: true })
        }

        clientStates.set(client, {
          clientIssues,
          messages: new Map(),
          turbopackUpdates: [],
          subscriptions,
        })

        client.on('close', () => {
          // Remove active subscriptions
          for (const subscription of subscriptions.values()) {
            subscription.return?.()
          }
          clientStates.delete(client)

          if (htmlRequestId) {
            clientsByHtmlRequestId.delete(htmlRequestId)
            deleteReactDebugChannelForHtmlRequest(htmlRequestId)
          } else {
            clientsWithoutHtmlRequestId.delete(client)
          }
        })

        client.addEventListener('message', async ({ data }) => {
          const parsedData = JSON.parse(
            typeof data !== 'string' ? data.toString() : data
          )

          // Next.js messages
          switch (parsedData.event) {
            case 'span-end': {
              hotReloaderSpan.manualTraceChild(
                parsedData.spanName,
                msToNs(parsedData.startTime),
                msToNs(parsedData.endTime),
                parsedData.attributes
              )
              break
            }
            case 'client-hmr-latency': // { id, startTime, endTime, page, updatedModules, isPageHidden }
              hotReloaderSpan.manualTraceChild(
                parsedData.event,
                msToNs(parsedData.startTime),
                msToNs(parsedData.endTime),
                {
                  updatedModules: parsedData.updatedModules,
                  page: parsedData.page,
                  isPageHidden: parsedData.isPageHidden,
                }
              )
              break

            case 'client-error': // { errorCount, clientId }
            case 'client-warning': // { warningCount, clientId }
            case 'client-success': // { clientId }
            case 'server-component-reload-page': // { clientId }
            case 'client-reload-page': // { clientId }
            case 'client-removed-page': // { page }
            case 'client-full-reload': // { stackTrace, hadRuntimeError }
              const { hadRuntimeError, dependencyChain } = parsedData
              if (hadRuntimeError) {
                Log.warn(FAST_REFRESH_RUNTIME_RELOAD)
              }
              if (
                Array.isArray(dependencyChain) &&
                typeof dependencyChain[0] === 'string'
              ) {
                const cleanedModulePath = dependencyChain[0]
                  .replace(/^\[project\]/, '.')
                  .replace(/ \[.*\] \(.*\)$/, '')
                Log.warn(
                  `Fast Refresh had to perform a full reload when ${cleanedModulePath} changed. Read more: https://nextjs.org/docs/messages/fast-refresh-reload`
                )
              }
              break
            case 'client-added-page':
              // TODO
              break
            case 'browser-logs': {
              await receiveBrowserLogsTurbopack({
                entries: parsedData.entries,
                router: parsedData.router,
                sourceType: parsedData.sourceType,
                project,
                projectPath,
                distDir,
                config:
                  (nextConfig.logging &&
                    nextConfig.logging.browserToTerminal) ||
                  false,
              })
              break
            }
            case 'ping': {
              // Handle ping events to keep WebSocket connections alive
              // No-op - just acknowledge the ping
              break
            }

            case 'mcp-error-state-response': {
              handleErrorStateResponse(
                parsedData.requestId,
                parsedData.errorState,
                parsedData.url
              )
              break
            }

            case 'mcp-page-metadata-response': {
              handlePageMetadataResponse(
                parsedData.requestId,
                parsedData.segmentTrieData,
                parsedData.url
              )
              break
            }

            default:
              // Might be a Turbopack message...
              if (!parsedData.type) {
                throw new Error(`unrecognized HMR message "${data}"`)
              }
          }

          // Turbopack messages
          switch (parsedData.type) {
            case 'turbopack-subscribe':
              subscribeToClientHmrEvents(client, parsedData.path)
              break

            case 'turbopack-unsubscribe':
              unsubscribeFromClientHmrEvents(client, parsedData.path)
              break

            default:
              if (!parsedData.event) {
                throw new Error(`unrecognized Turbopack HMR message "${data}"`)
              }
          }
        })

        const turbopackConnectedMessage: TurbopackConnectedMessage = {
          type: HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_CONNECTED,
          data: { sessionId },
        }
        sendToClient(client, turbopackConnectedMessage)

        const errors: CompilationError[] = []

        for (const entryIssues of currentEntryIssues.values()) {
          for (const issue of entryIssues.values()) {
            if (issue.severity !== 'warning') {
              errors.push({
                message: formatIssue(issue),
              })
            } else {
              printNonFatalIssue(issue)
            }
          }
        }

        if (devIndicatorServerState.disabledUntil < Date.now()) {
          devIndicatorServerState.disabledUntil = 0
        }

        ;(async function () {
          const versionInfo = await getVersionInfoCached()
          const devToolsConfig = await getDevToolsConfig(distDir)

          const syncMessage: SyncMessage = {
            type: HMR_MESSAGE_SENT_TO_BROWSER.SYNC,
            errors,
            warnings: [],
            hash: '',
            versionInfo,
            debug: {
              devtoolsFrontendUrl,
            },
            devIndicator: devIndicatorServerState,
            devToolsConfig,
            requestInsights:
              nextConfig.experimental.requestInsights ||
              isRequestInsightsEnabled()
                ? getRequestInsightsSnapshot()
                : undefined,
          }

          sendToClient(client, syncMessage)
        })()
      })
    },

    send(action) {
      const payload = JSON.stringify(action)

      for (const client of [
        ...clientsWithoutHtmlRequestId,
        ...clientsByHtmlRequestId.values(),
      ]) {
        client.send(payload)
      }
    },

    getServerComponentsHmrRefreshHash() {
      // Only the change subscription (an actual recompile) advances `hmrHash`;
      // reloads and config invalidations don't, so the value stays stable
      // across requests until a real edit. `sessionId` stands in for a key
      // derived from the compiled implementation, which would let entries
      // outlive a restart when the code didn't change (see the note on Action
      // IDs in `use-cache-wrapper.ts`).
      return `${sessionId}-${hmrHash}`
    },

    sendToLegacyClients(action) {
      const payload = JSON.stringify(action)

      // Clients with a request ID are inferred App Router clients. If Cache
      // Components is not enabled, we consider those legacy clients. Pages
      // Router clients are also considered legacy clients. TODO: Maybe mark
      // clients as App Router / Pages Router clients explicitly, instead of
      // inferring it from the presence of a request ID.

      if (!nextConfig.cacheComponents) {
        for (const client of clientsByHtmlRequestId.values()) {
          client.send(payload)
        }
      }

      for (const client of clientsWithoutHtmlRequestId) {
        client.send(payload)
      }
    },

    setCacheStatus(status: ServerCacheStatus, htmlRequestId: string): void {
      // Legacy clients don't have Cache Components.
      const client = clientsByHtmlRequestId.get(htmlRequestId)
      if (client !== undefined) {
        sendToClient(client, {
          type: HMR_MESSAGE_SENT_TO_BROWSER.CACHE_INDICATOR,
          state: status,
        })
      } else {
        // If the client is not connected, store the status so that we can send it
        // when the client connects.
        cacheStatusesByHtmlRequestId.set(htmlRequestId, status)
      }
    },

    setReactDebugChannel(debugChannel, htmlRequestId, requestId) {
      const client = clientsByHtmlRequestId.get(htmlRequestId)

      if (htmlRequestId === requestId) {
        // The debug channel is for the HTML request.
        if (client) {
          // If the client is connected, we can connect the debug channel for
          // the HTML request immediately.
          connectReactDebugChannel(
            htmlRequestId,
            debugChannel,
            sendToClient.bind(null, client)
          )
        } else {
          // Otherwise, we'll do that when the client connects and just store
          // the debug channel.
          setReactDebugChannelForHtmlRequest(htmlRequestId, debugChannel)
        }
      } else if (client) {
        // The debug channel is for a subsequent request (e.g. client-side
        // navigation for server function call). If the client is not connected
        // anymore, we don't need to connect the debug channel.
        connectReactDebugChannel(
          requestId,
          debugChannel,
          sendToClient.bind(null, client)
        )
      }
    },

    sendErrorsToBrowser(errorsRscStream, htmlRequestId) {
      const client = clientsByHtmlRequestId.get(htmlRequestId)

      if (client) {
        // If the client is connected, we can send the errors immediately.
        sendSerializedErrorsToClient(
          errorsRscStream,
          sendToClient.bind(null, client)
        )
      } else {
        // Otherwise, store the errors stream so that we can send it when the
        // client connects.
        setErrorsRscStreamForHtmlRequest(htmlRequestId, errorsRscStream)
      }
    },

    setHmrServerError(_error) {
      // Not implemented yet.
    },
    clearHmrServerError() {
      // Not implemented yet.
    },
    async start() {},
    async getCompilationErrors(page) {
      const appEntryKey = getEntryKey('app', 'server', page)
      const pagesEntryKey = getEntryKey('pages', 'server', page)

      const topLevelIssues = currentTopLevelIssues.values()

      const thisEntryIssues =
        currentEntryIssues.get(appEntryKey) ??
        currentEntryIssues.get(pagesEntryKey)

      if (thisEntryIssues !== undefined && thisEntryIssues.size > 0) {
        // If there is an error related to the requesting page we display it instead of the first error
        return [...topLevelIssues, ...thisEntryIssues.values()]
          .map((issue) => {
            const formattedIssue = formatIssue(issue)
            if (issue.severity === 'warning') {
              printNonFatalIssue(issue)
              return null
            } else if (isWellKnownError(issue)) {
              Log.error(formattedIssue)
            }

            return new Error(formattedIssue)
          })
          .filter((error) => error !== null)
      }

      // Otherwise, return all errors across pages
      const errors = []
      for (const issue of topLevelIssues) {
        if (issue.severity !== 'warning') {
          errors.push(new Error(formatIssue(issue)))
        }
      }
      for (const entryIssues of currentEntryIssues.values()) {
        for (const issue of entryIssues.values()) {
          if (issue.severity !== 'warning') {
            const message = formatIssue(issue)
            errors.push(new Error(message))
          } else {
            printNonFatalIssue(issue)
          }
        }
      }
      return errors
    },
    async invalidate({ reloadAfterInvalidation }) {
      if (reloadAfterInvalidation) {
        for (const [key, entrypoint] of currentWrittenEntrypoints) {
          clearRequireCache(key, entrypoint, { force: true })
        }

        await clearAllModuleContexts()
        this.send({
          type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
        })
      }
    },
    async buildFallbackError() {
      // Not implemented yet.
    },
    async ensurePage({
      page: inputPage,
      // Unused parameters
      // clientOnly,
      appPaths,
      definition,
      isApp,
      url: requestUrl,
      subscribeToChanges = true,
    }) {
      // When there is no route definition this is an internal file not a route the user added.
      // Middleware and instrumentation are handled in turbopack-utils.ts handleEntrypoints instead.
      if (!definition) {
        if (inputPage === '/middleware') return
        if (inputPage === '/src/middleware') return
        if (inputPage === '/instrumentation') return
        if (inputPage === '/src/instrumentation') return
      }

      return hotReloaderSpan
        .traceChild('ensure-page', {
          inputPage,
        })
        .traceAsyncFn(async () => {
          if (BLOCKED_PAGES.includes(inputPage) && inputPage !== '/_error') {
            return
          }

          await currentEntriesHandling

          // TODO We shouldn't look into the filesystem again. This should use the information from entrypoints
          let routeDef: Pick<
            RouteDefinition,
            'filename' | 'bundlePath' | 'page'
          > =
            definition ??
            (await findPagePathData(
              projectPath,
              inputPage,
              nextConfig.pageExtensions,
              opts.pagesDir,
              opts.appDir,
              !!nextConfig.experimental.globalNotFound
            ))

          // If the route is actually an app page route, then we should have access
          // to the app route definition, and therefore, the appPaths from it.
          if (!appPaths && definition && isAppPageRouteDefinition(definition)) {
            appPaths = definition.appPaths
          }

          // Check if this is a deferred entry and wait for non-deferred entries first
          if (hasDeferredEntriesConfig) {
            const isDeferred = isDeferredEntry(
              routeDef.page,
              deferredEntriesConfig
            )
            if (isDeferred) {
              await processDeferredEntry()
            } else {
              // Track non-deferred entry as building
              nonDeferredBuildingEntries.add(routeDef.page)
            }
          }

          let page = routeDef.page
          if (appPaths) {
            const normalizedPage = normalizeAppPath(page)

            // filter out paths that are not exact matches (e.g. catchall)
            const matchingAppPaths = appPaths.filter(
              (path) => normalizeAppPath(path) === normalizedPage
            )

            // the last item in the array is the root page, if there are parallel routes
            page = matchingAppPaths[matchingAppPaths.length - 1]
          }

          const pathname = definition?.pathname ?? inputPage

          if (page === '/_error') {
            let finishBuilding = startBuilding(pathname, requestUrl, false)
            try {
              await handlePagesErrorRoute({
                currentEntryIssues,
                entrypoints: currentEntrypoints,
                manifestLoader,
                devRewrites: opts.fsChecker.rewrites,
                productionRewrites: undefined,
                logErrors: true,
                hooks: {
                  subscribeToChanges: subscribeToClientChanges,
                  handleWrittenEndpoint: (id, result, forceDeleteCache) => {
                    currentWrittenEntrypoints.set(id, result)
                    assetMapper.setPathsForKey(id, result.clientPaths)
                    return clearRequireCache(id, result, {
                      force: forceDeleteCache,
                    })
                  },
                },
              })
            } finally {
              finishBuilding()
            }
            return
          }

          const isInsideAppDir = routeDef.bundlePath.startsWith('app/')
          const isEntryMetadataRouteFile = isMetadataRouteFile(
            routeDef.filename.replace(opts.appDir || '', ''),
            nextConfig.pageExtensions,
            true
          )
          const normalizedAppPage = isEntryMetadataRouteFile
            ? normalizedPageToTurbopackStructureRoute(
                page,
                extname(routeDef.filename)
              )
            : page

          const route = isInsideAppDir
            ? currentEntrypoints.app.get(normalizedAppPage)
            : currentEntrypoints.page.get(page)

          if (!route) {
            // TODO: why is this entry missing in turbopack?
            if (page === '/middleware') return
            if (page === '/src/middleware') return
            if (page === '/proxy') return
            if (page === '/src/proxy') return
            if (page === '/instrumentation') return
            if (page === '/src/instrumentation') return

            throw new PageNotFoundError(`route not found ${page}`)
          }

          // We don't throw on ensureOpts.isApp === true for page-api
          // since this can happen when app pages make
          // api requests to page API routes.
          if (isApp && route.type === 'page') {
            throw new Error(`mis-matched route type: isApp && page for ${page}`)
          }

          const finishBuilding = startBuilding(pathname, requestUrl, false)
          try {
            await handleRouteType({
              dev,
              page,
              pathname,
              route,
              currentEntryIssues,
              entrypoints: currentEntrypoints,
              manifestLoader,
              readyIds,
              devRewrites: opts.fsChecker.rewrites,
              productionRewrites: undefined,
              logErrors: true,

              hooks: {
                // Pass a no-o subscribeToChanges to skip wiring HMR subscriptions for
                // one-shot compilations (e.g. compile_route MCP tool).
                subscribeToChanges: subscribeToChanges
                  ? subscribeToClientChanges
                  : ((async () => {}) as StartChangeSubscription),
                handleServerComponentChanges,
                handleWrittenEndpoint: (id, result, forceDeleteCache) => {
                  currentWrittenEntrypoints.set(id, result)
                  assetMapper.setPathsForKey(id, result.clientPaths)
                  return clearRequireCache(id, result, {
                    force: forceDeleteCache,
                  })
                },
                serverFastRefresh,
              },
            })
          } finally {
            finishBuilding()
            // Remove non-deferred entry from building set
            if (hasDeferredEntriesConfig) {
              nonDeferredBuildingEntries.delete(routeDef.page)
            }
          }
        })
    },
    close() {
      // Report MCP telemetry if MCP server is enabled
      recordMcpTelemetry(opts.telemetry)

      for (const wsClient of [
        ...clientsWithoutHtmlRequestId,
        ...clientsByHtmlRequestId.values(),
      ]) {
        // it's okay to not cleanly close these websocket connections, this is dev
        wsClient.terminate()
      }
      clientsWithoutHtmlRequestId.clear()
      clientsByHtmlRequestId.clear()
    },
  }

  handleEntrypointsSubscription().catch((err) => {
    console.error(err)
    process.exit(1)
  })

  // Write empty manifests
  await currentEntriesHandling
  await manifestLoader.writeManifests({
    devRewrites: opts.fsChecker.rewrites,
    productionRewrites: undefined,
    entrypoints: currentEntrypoints,
  })

  async function handleProjectUpdates() {
    const BUILDING_MESSAGE_DEFER_MS = 100
    for await (const updateMessage of project.updateInfoSubscribe(30)) {
      switch (updateMessage.updateType) {
        case 'start': {
          updateInProgress = true
          pendingBuilding.schedule(BUILDING_MESSAGE_DEFER_MS, () => {
            hotReloader.send({ type: HMR_MESSAGE_SENT_TO_BROWSER.BUILDING })
          })
          // Mark that HMR has started and we need to call the callback after it settles
          // This ensures onBeforeDeferredEntries will be called again during HMR
          if (hasDeferredEntriesConfig) {
            hmrPendingDeferredCallback = true
            onBeforeDeferredEntriesCalled = false
            onBeforeDeferredEntriesPromise = null
          }
          break
        }
        case 'end': {
          updateInProgress = false
          pendingBuilding.cancel()
          if (pendingServerComponentChanges) {
            pendingServerComponentChanges = false
            sendServerComponentChanges()
          }
          sendEnqueuedMessages()

          function addToErrorsMap(
            errorsMap: Map<string, CompilationError>,
            issueMap: IssuesMap
          ) {
            for (const [key, issue] of issueMap) {
              if (issue.severity === 'warning') continue
              if (errorsMap.has(key)) continue

              const message = formatIssue(issue)

              errorsMap.set(key, {
                message,
                details: issue.detail
                  ? renderStyledStringToErrorAnsi(issue.detail)
                  : undefined,
              })
            }
          }

          function addErrors(
            errorsMap: Map<string, CompilationError>,
            issues: EntryIssuesMap
          ) {
            for (const issueMap of issues.values()) {
              addToErrorsMap(errorsMap, issueMap)
            }
          }

          const errors = new Map<string, CompilationError>()
          addToErrorsMap(errors, currentTopLevelIssues)
          addErrors(errors, currentEntryIssues)

          for (const client of [
            ...clientsWithoutHtmlRequestId,
            ...clientsByHtmlRequestId.values(),
          ]) {
            const state = clientStates.get(client)
            if (!state) {
              continue
            }

            const clientErrors = new Map(errors)
            addErrors(clientErrors, state.clientIssues)

            sendToClient(client, {
              type: HMR_MESSAGE_SENT_TO_BROWSER.BUILT,
              // Report the current version without advancing it: a completed
              // compilation is not itself an edit, and this hash is not
              // consumed by the Turbopack client.
              hash: String(hmrHash),
              errors: [...clientErrors.values()],
              warnings: [],
            })
          }

          if (hmrEventHappened) {
            const time = updateMessage.value.duration
            const timeMessage =
              time > 2000 ? `${Math.round(time / 100) / 10}s` : `${time}ms`
            Log.event(`Compiled in ${timeMessage}`)
            hmrEventHappened = false
          }

          // Call onBeforeDeferredEntries after compilation completes during HMR
          // This ensures the callback is invoked even when non-deferred entries change
          // Use debounced function to prevent rapid-fire calls from turbopack updates
          if (hasDeferredEntriesConfig) {
            callOnBeforeDeferredEntriesAfterHMR()
          }
          break
        }
        default:
      }
    }
  }

  handleProjectUpdates().catch((err) => {
    console.error(err)
    process.exit(1)
  })

  // Tell browsers to refetch RSC (soft refresh, not full page reload).
  // Skip while there are outstanding compilation errors: an RSC refetch would
  // 500 and force a full-page navigation, losing client state (e.g. recovering
  // from a syntax error). A subsequent successful compile/apply fires this
  // again to refresh.
  function notifyServerComponentChanges() {
    if (hasCompilationErrors()) return
    hotReloader.send({
      type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
    })
  }

  if (serverFastRefresh) {
    setupServerHmr(project, {
      reEvaluateAllModulesExpensive: async () => {
        // Evict every server-HMR-managed chunk from `require.cache`.
        // Trailing `sep` so e.g. `server/chunks-other/...` doesn't match.
        const serverChunksDir = join(distDir, SERVER_HMR_CHUNKS_DIR) + sep
        const chunkPaths = Object.keys(require.cache).filter((p) =>
          p.startsWith(serverChunksDir)
        )
        deleteCache(chunkPaths)

        // Clear Turbopack's runtime caches
        if (typeof __next__clear_chunk_cache__ === 'function') {
          __next__clear_chunk_cache__()
        }

        // Reset the server HMR handler registry. All server runtime chunks are
        // cleared from require.cache above; when they're next required they'll
        // re-register into this Map and reinstall the routing dispatcher.
        globalThis.__turbopack_server_hmr_handlers__ = new Map()

        // Clear all edge contexts
        await clearAllModuleContexts()

        resetFetch()

        // This thread gave up on repairing its module graph in place. The
        // validation worker cannot repair its own either, so it is dropped and
        // the next validation loads the build output afresh.
        dropDevValidationWorker()

        notifyServerComponentChanges()
      },
      onApplied: (chunkPaths: string[]) => {
        // Clear the evalManifest() shared cache for each updated chunk so the
        // next RSC render picks up the HMR-applied module changes. Unlike
        // a full restart, this does NOT clear require.cache — the HMR-applied
        // modules in devModuleCache must persist for dep preservation.
        const manifestPaths = chunkPaths.map((chunkPath) =>
          join(distDir, chunkPath)
        )

        for (const manifestPath of manifestPaths) {
          clearManifestCache(manifestPath)
        }

        // This path clears the manifest cache without going through
        // `deleteCache`, so `onCacheInvalidation` does not report it to the
        // validation worker. Report it here instead.
        mirrorModuleStateToDevValidationWorker({
          type: 'invalidate',
          filePaths: manifestPaths,
          evictModules: false,
        })

        notifyServerComponentChanges()
      },
    })
  }

  return hotReloader
}

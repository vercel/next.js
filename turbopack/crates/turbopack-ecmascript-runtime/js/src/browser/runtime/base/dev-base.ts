/// <reference path="../../../shared/runtime/dev-globals.d.ts" />
/// <reference path="../../../shared/runtime/dev-protocol.d.ts" />

interface TurbopackDevContext extends TurbopackBrowserBaseContext<HotModule> {
  k: RefreshContext
}

const devContextPrototype = Context.prototype as TurbopackDevContext

/**
 * This file contains runtime types and functions that are shared between all
 * Turbopack *development* ECMAScript runtimes.
 *
 * It will be appended to the runtime code of each runtime right after the
 * shared runtime utils.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */

// Assign browser's module cache and runtime modules to shared HMR state
devModuleCache = Object.create(null)
devContextPrototype.c = devModuleCache
runtimeModules = new Set()

// Set flag to indicate we use ModuleWithDirection
createModuleWithDirectionFlag = true

// This file must not use `import` and `export` statements. Otherwise, it
// becomes impossible to augment interfaces declared in `<reference>`d files
// (e.g. `Module`). Hence, the need for `import()` here.
type RefreshRuntimeGlobals =
  import('@next/react-refresh-utils/dist/runtime').RefreshRuntimeGlobals

declare var $RefreshHelpers$: RefreshRuntimeGlobals['$RefreshHelpers$']
declare var $RefreshReg$: RefreshRuntimeGlobals['$RefreshReg$']
declare var $RefreshSig$: RefreshRuntimeGlobals['$RefreshSig$']
declare var $RefreshInterceptModuleExecution$: RefreshRuntimeGlobals['$RefreshInterceptModuleExecution$']

type RefreshContext = {
  register: RefreshRuntimeGlobals['$RefreshReg$']
  signature: RefreshRuntimeGlobals['$RefreshSig$']
  registerExports: typeof registerExportsAndSetupBoundaryForReactRefresh
}

type RefreshHelpers = RefreshRuntimeGlobals['$RefreshHelpers$']

type ModuleFactory = (
  this: Module['exports'],
  context: TurbopackDevContext
) => unknown

interface DevRuntimeBackend {
  reloadChunk?: (chunkUrl: ChunkUrl) => Promise<void>
  unloadChunk?: (chunkUrl: ChunkUrl) => void
  restart: () => void
}

/**
 * Map from module ID to the chunks that contain this module.
 *
 * In HMR, we need to keep track of which modules are contained in which so
 * chunks. This is so we don't eagerly dispose of a module when it is removed
 * from chunk A, but still exists in chunk B.
 */
const moduleChunksMap: Map<ModuleId, Set<ChunkPath>> = new Map()
/**
 * Map from a chunk path to all modules it contains.
 */
const chunkModulesMap: Map<ChunkPath, Set<ModuleId>> = new Map()
/**
 * Chunk lists that contain a runtime. When these chunk lists receive an update
 * that can't be reconciled with the current state of the page, we need to
 * reload the runtime entirely.
 */
const runtimeChunkLists: Set<ChunkListPath> = new Set()
/**
 * Map from a chunk list to the chunk paths it contains.
 */
const chunkListChunksMap: Map<ChunkListPath, Set<ChunkPath>> = new Map()
/**
 * Map from a chunk path to the chunk lists it belongs to.
 */
const chunkChunkListsMap: Map<ChunkPath, Set<ChunkListPath>> = new Map()

/**
 * Gets or instantiates a runtime module.
 */
// @ts-ignore
function getOrInstantiateRuntimeModule(
  chunkPath: ChunkPath,
  moduleId: ModuleId
): Module {
  const module = devModuleCache[moduleId]
  if (module) {
    if (module.error) {
      throw module.error
    }
    return module
  }

  // @ts-ignore
  return instantiateModule(moduleId, SourceType.Runtime, chunkPath)
}

/**
 * Retrieves a module from the cache, or instantiate it if it is not cached.
 */
// @ts-ignore Defined in `runtime-utils.ts`
const getOrInstantiateModuleFromParent: GetOrInstantiateModuleFromParent<
  HotModule
> = (id, sourceModule) => {
  if (!sourceModule.hot.active) {
    console.warn(
      `Unexpected import of module ${id} from module ${sourceModule.id}, which was deleted by an HMR update`
    )
  }

  const module = devModuleCache[id]

  if (sourceModule.children.indexOf(id) === -1) {
    sourceModule.children.push(id)
  }

  if (module) {
    if (module.error) {
      throw module.error
    }

    if (module.parents.indexOf(sourceModule.id) === -1) {
      module.parents.push(sourceModule.id)
    }

    return module
  }

  return instantiateModule(id, SourceType.Parent, sourceModule.id)
}

function DevContext(
  this: TurbopackDevContext,
  module: HotModule,
  exports: Exports,
  refresh: RefreshContext
) {
  Context.call(this, module, exports)
  this.k = refresh
}
DevContext.prototype = Context.prototype

type DevContextConstructor = {
  new (
    module: HotModule,
    exports: Exports,
    refresh: RefreshContext
  ): TurbopackDevContext
}

function instantiateModule(
  moduleId: ModuleId,
  sourceType: SourceType,
  sourceData: SourceData
): Module {
  // Browser: creates base HotModule object (hot API added by shared code)
  const createModuleObjectFn = (id: ModuleId) => {
    return createModuleObject(id) as HotModule
  }

  // Browser: creates DevContext with refresh
  const createContext = (
    module: HotModule,
    exports: Exports,
    refresh: RefreshContext
  ) => {
    return new (DevContext as any as DevContextConstructor)(
      module,
      exports,
      refresh
    )
  }

  // Use shared instantiation logic (includes hot API setup)
  return instantiateModuleShared(
    moduleId,
    sourceType,
    sourceData,
    moduleFactories,
    devModuleCache,
    runtimeModules,
    createModuleObjectFn,
    createContext,
    runModuleExecutionHooks
  )
}

const DUMMY_REFRESH_CONTEXT = {
  register: (_type: unknown, _id: unknown) => {},
  signature: () => (_type: unknown) => {},
  registerExports: (_module: unknown, _helpers: unknown) => {},
}

/**
 * NOTE(alexkirsz) Webpack has a "module execution" interception hook that
 * Next.js' React Refresh runtime hooks into to add module context to the
 * refresh registry.
 */
function runModuleExecutionHooks(
  module: HotModule,
  executeModule: (ctx: RefreshContext) => void
) {
  if (typeof globalThis.$RefreshInterceptModuleExecution$ === 'function') {
    const cleanupReactRefreshIntercept =
      globalThis.$RefreshInterceptModuleExecution$(module.id)
    try {
      executeModule({
        register: globalThis.$RefreshReg$,
        signature: globalThis.$RefreshSig$,
        registerExports: registerExportsAndSetupBoundaryForReactRefresh,
      })
    } finally {
      // Always cleanup the intercept, even if module execution failed.
      cleanupReactRefreshIntercept()
    }
  } else {
    // If the react refresh hooks are not installed we need to bind dummy functions.
    // This is expected when running in a Web Worker.  It is also common in some of
    // our test environments.
    executeModule(DUMMY_REFRESH_CONTEXT)
  }
}

/**
 * This is adapted from https://github.com/vercel/next.js/blob/3466862d9dc9c8bb3131712134d38757b918d1c0/packages/react-refresh-utils/internal/ReactRefreshModule.runtime.ts
 */
function registerExportsAndSetupBoundaryForReactRefresh(
  module: HotModule,
  helpers: RefreshHelpers
) {
  const currentExports = module.exports
  const prevExports = module.hot.data.prevExports ?? null

  helpers.registerExportsForReactRefresh(currentExports, module.id)

  // A module can be accepted automatically based on its exports, e.g. when
  // it is a Refresh Boundary.
  if (helpers.isReactRefreshBoundary(currentExports)) {
    // Save the previous exports on update, so we can compare the boundary
    // signatures.
    module.hot.dispose((data) => {
      data.prevExports = currentExports
    })
    // Unconditionally accept an update to this module, we'll check if it's
    // still a Refresh Boundary later.
    module.hot.accept()

    // This field is set when the previous version of this module was a
    // Refresh Boundary, letting us know we need to check for invalidation or
    // enqueue an update.
    if (prevExports !== null) {
      // A boundary can become ineligible if its exports are incompatible
      // with the previous exports.
      //
      // For example, if you add/remove/change exports, we'll want to
      // re-execute the importing modules, and force those components to
      // re-render. Similarly, if you convert a class component to a
      // function, we want to invalidate the boundary.
      if (
        helpers.shouldInvalidateReactRefreshBoundary(
          helpers.getRefreshBoundarySignature(prevExports),
          helpers.getRefreshBoundarySignature(currentExports)
        )
      ) {
        module.hot.invalidate()
      } else {
        helpers.scheduleUpdate()
      }
    }
  } else {
    // Since we just executed the code for the module, it's possible that the
    // new exports made it ineligible for being a boundary.
    // We only care about the case when we were _previously_ a boundary,
    // because we already accepted this update (accidental side effect).
    const isNoLongerABoundary = prevExports !== null
    if (isNoLongerABoundary) {
      module.hot.invalidate()
    }
  }
}

/**
 * Adds, deletes, and moves modules between chunks. This must happen before the
 * dispose phase as it needs to know which modules were removed from all chunks,
 * which we can only compute *after* taking care of added and moved modules.
 */
function updateChunksPhase(
  chunksAddedModules: Map<ChunkPath, Set<ModuleId>>,
  chunksDeletedModules: Map<ChunkPath, Set<ModuleId>>
): { disposedModules: Set<ModuleId> } {
  for (const [chunkPath, addedModuleIds] of chunksAddedModules) {
    for (const moduleId of addedModuleIds) {
      addModuleToChunk(moduleId, chunkPath)
    }
  }

  const disposedModules: Set<ModuleId> = new Set()
  for (const [chunkPath, addedModuleIds] of chunksDeletedModules) {
    for (const moduleId of addedModuleIds) {
      if (removeModuleFromChunk(moduleId, chunkPath)) {
        disposedModules.add(moduleId)
      }
    }
  }

  return { disposedModules }
}

function applyUpdate(update: PartialUpdate) {
  switch (update.type) {
    case 'ChunkListUpdate':
      applyChunkListUpdate(update)
      break
    default:
      invariant(update, (update) => `Unknown update type: ${update.type}`)
  }
}

function applyChunkListUpdate(update: ChunkListUpdate) {
  if (update.merged != null) {
    for (const merged of update.merged) {
      switch (merged.type) {
        case 'EcmascriptMergedUpdate':
          applyEcmascriptMergedUpdate(merged)
          break
        default:
          invariant(merged, (merged) => `Unknown merged type: ${merged.type}`)
      }
    }
  }

  if (update.chunks != null) {
    for (const [chunkPath, chunkUpdate] of Object.entries(
      update.chunks
    ) as Array<[ChunkPath, ChunkUpdate]>) {
      const chunkUrl = getChunkRelativeUrl(chunkPath)

      switch (chunkUpdate.type) {
        case 'added':
          BACKEND.loadChunkCached(SourceType.Update, chunkUrl)
          break
        case 'total':
          DEV_BACKEND.reloadChunk?.(chunkUrl)
          break
        case 'deleted':
          DEV_BACKEND.unloadChunk?.(chunkUrl)
          break
        case 'partial':
          invariant(
            chunkUpdate.instruction,
            (instruction) =>
              `Unknown partial instruction: ${JSON.stringify(instruction)}.`
          )
          break
        default:
          invariant(
            chunkUpdate,
            (chunkUpdate) => `Unknown chunk update type: ${chunkUpdate.type}`
          )
      }
    }
  }
}

function applyEcmascriptMergedUpdate(update: EcmascriptMergedUpdate) {
  // Browser-specific chunk management phase
  const { entries = {}, chunks = {} } = update
  const { added, modified, chunksAdded, chunksDeleted } = computeChangedModules(
    entries,
    chunks,
    chunkModulesMap
  )
  const { disposedModules } = updateChunksPhase(chunksAdded, chunksDeleted)

  // Use shared HMR update implementation
  applyEcmascriptMergedUpdateShared({
    added,
    modified,
    disposedModules,
    evalModuleEntry: _eval, // browser's eval with source maps
    instantiateModule, // now wraps shared logic
    applyModuleFactoryName,
    moduleFactories,
    devModuleCache,
    autoAcceptRootModules: false,
  })
}

function handleApply(chunkListPath: ChunkListPath, update: ServerMessage) {
  switch (update.type) {
    case 'partial': {
      // This indicates that the update is can be applied to the current state of the application.
      applyUpdate(update.instruction)
      break
    }
    case 'restart': {
      // This indicates that there is no way to apply the update to the
      // current state of the application, and that the application must be
      // restarted.
      DEV_BACKEND.restart()
      break
    }
    case 'notFound': {
      // This indicates that the chunk list no longer exists: either the dynamic import which created it was removed,
      // or the page itself was deleted.
      // If it is a dynamic import, we simply discard all modules that the chunk has exclusive access to.
      // If it is a runtime chunk list, we restart the application.
      if (runtimeChunkLists.has(chunkListPath)) {
        DEV_BACKEND.restart()
      } else {
        disposeChunkList(chunkListPath)
      }
      break
    }
    default:
      throw new Error(`Unknown update type: ${update.type}`)
  }
}

/**
 * Removes a module from a chunk.
 * Returns `true` if there are no remaining chunks including this module.
 */
function removeModuleFromChunk(
  moduleId: ModuleId,
  chunkPath: ChunkPath
): boolean {
  const moduleChunks = moduleChunksMap.get(moduleId)!
  moduleChunks.delete(chunkPath)

  const chunkModules = chunkModulesMap.get(chunkPath)!
  chunkModules.delete(moduleId)

  const noRemainingModules = chunkModules.size === 0
  if (noRemainingModules) {
    chunkModulesMap.delete(chunkPath)
  }

  const noRemainingChunks = moduleChunks.size === 0
  if (noRemainingChunks) {
    moduleChunksMap.delete(moduleId)
  }

  return noRemainingChunks
}

/**
 * Disposes of a chunk list and its corresponding exclusive chunks.
 */
function disposeChunkList(chunkListPath: ChunkListPath): boolean {
  const chunkPaths = chunkListChunksMap.get(chunkListPath)
  if (chunkPaths == null) {
    return false
  }
  chunkListChunksMap.delete(chunkListPath)

  for (const chunkPath of chunkPaths) {
    const chunkChunkLists = chunkChunkListsMap.get(chunkPath)!
    chunkChunkLists.delete(chunkListPath)

    if (chunkChunkLists.size === 0) {
      chunkChunkListsMap.delete(chunkPath)
      disposeChunk(chunkPath)
    }
  }

  // We must also dispose of the chunk list's chunk itself to ensure it may
  // be reloaded properly in the future.
  const chunkListUrl = getChunkRelativeUrl(chunkListPath)

  DEV_BACKEND.unloadChunk?.(chunkListUrl)

  return true
}

/**
 * Disposes of a chunk and its corresponding exclusive modules.
 *
 * @returns Whether the chunk was disposed of.
 */
function disposeChunk(chunkPath: ChunkPath): boolean {
  const chunkUrl = getChunkRelativeUrl(chunkPath)
  // This should happen whether the chunk has any modules in it or not.
  // For instance, CSS chunks have no modules in them, but they still need to be unloaded.
  DEV_BACKEND.unloadChunk?.(chunkUrl)

  const chunkModules = chunkModulesMap.get(chunkPath)
  if (chunkModules == null) {
    return false
  }
  chunkModules.delete(chunkPath)

  for (const moduleId of chunkModules) {
    const moduleChunks = moduleChunksMap.get(moduleId)!
    moduleChunks.delete(chunkPath)

    const noRemainingChunks = moduleChunks.size === 0
    if (noRemainingChunks) {
      moduleChunksMap.delete(moduleId)
      disposeModule(moduleId, 'clear')
      availableModules.delete(moduleId)
    }
  }

  return true
}

/**
 * Adds a module to a chunk.
 */
function addModuleToChunk(moduleId: ModuleId, chunkPath: ChunkPath) {
  let moduleChunks = moduleChunksMap.get(moduleId)
  if (!moduleChunks) {
    moduleChunks = new Set([chunkPath])
    moduleChunksMap.set(moduleId, moduleChunks)
  } else {
    moduleChunks.add(chunkPath)
  }

  let chunkModules = chunkModulesMap.get(chunkPath)
  if (!chunkModules) {
    chunkModules = new Set([moduleId])
    chunkModulesMap.set(chunkPath, chunkModules)
  } else {
    chunkModules.add(moduleId)
  }
}

/**
 * Marks a chunk list as a runtime chunk list. There can be more than one
 * runtime chunk list. For instance, integration tests can have multiple chunk
 * groups loaded at runtime, each with its own chunk list.
 */
function markChunkListAsRuntime(chunkListPath: ChunkListPath) {
  runtimeChunkLists.add(chunkListPath)
}

function registerChunk(registration: ChunkRegistration) {
  const chunk = getChunkFromRegistration(registration[0]) as
    | ChunkPath
    | ChunkScript
  let runtimeParams: RuntimeParams | undefined
  // When bootstrapping we are passed a single runtimeParams object so we can distinguish purely based on length
  if (registration.length === 2) {
    runtimeParams = registration[1] as RuntimeParams
  } else {
    let chunkPath = getPathFromScript(chunk)
    runtimeParams = undefined
    installCompressedModuleFactories(
      registration as CompressedModuleFactories,
      /* offset= */ 1,
      moduleFactories,
      (id: ModuleId) => addModuleToChunk(id, chunkPath)
    )
  }
  return BACKEND.registerChunk(chunk, runtimeParams)
}

/**
 * Subscribes to chunk list updates from the update server and applies them.
 */
function registerChunkList(chunkList: ChunkList) {
  const chunkListScript = getChunkFromRegistration(chunkList.script) as
    | ChunkListPath
    | ChunkListScript
  const chunkListPath = getPathFromScript(chunkListScript)
  // The "chunk" is also registered to finish the loading in the backend
  BACKEND.registerChunk(chunkListPath as string as ChunkPath)
  globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS!.push([
    chunkListPath,
    handleApply.bind(null, chunkListPath),
  ])

  // Adding chunks to chunk lists and vice versa.
  const chunkPaths = new Set(chunkList.chunks.map(getChunkPath))
  chunkListChunksMap.set(chunkListPath, chunkPaths)
  for (const chunkPath of chunkPaths) {
    let chunkChunkLists = chunkChunkListsMap.get(chunkPath)
    if (!chunkChunkLists) {
      chunkChunkLists = new Set([chunkListPath])
      chunkChunkListsMap.set(chunkPath, chunkChunkLists)
    } else {
      chunkChunkLists.add(chunkListPath)
    }
  }

  if (chunkList.source === 'entry') {
    markChunkListAsRuntime(chunkListPath)
  }
}

globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS ??= []

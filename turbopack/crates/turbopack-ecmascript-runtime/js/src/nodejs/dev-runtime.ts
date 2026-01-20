/**
 * Node.js Development Runtime with HMR support.
 *
 * This runtime extends the base Node.js runtime with Hot Module Replacement
 * functionality for server-side code.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../shared/runtime-utils.ts" />
/// <reference path="../shared-node/base-externals-utils.ts" />
/// <reference path="../shared-node/node-externals-utils.ts" />
/// <reference path="../shared-node/node-wasm-utils.ts" />

enum SourceType {
  /**
   * The module was instantiated because it was included in an evaluated chunk's
   * runtime.
   * SourceData is a ChunkPath.
   */
  Runtime = 0,
  /**
   * The module was instantiated because a parent module imported it.
   * SourceData is a ModuleId.
   */
  Parent = 1,
  /**
   * The module was instantiated because of an HMR update.
   * SourceData is the parent module IDs.
   */
  Update = 2,
}

type SourceData = ChunkPath | ModuleId | ModuleId[]

process.env.TURBOPACK = '1'

// ============================================================================
// HMR Types
// ============================================================================

interface HotData {
  prevExports?: Exports
}

interface HotState {
  selfAccepted: boolean | Function
  selfDeclined: boolean
  selfInvalidated: boolean
  disposeHandlers: ((data: object) => void)[]
}

type AcceptErrorHandler = (
  err: Error,
  context: { moduleId: ModuleId; module: HotModule }
) => void

interface Hot {
  active: boolean
  data: HotData

  accept: (
    modules?: string | string[] | AcceptErrorHandler,
    callback?: () => void,
    errorHandler?: AcceptErrorHandler
  ) => void

  decline: (module?: string | string[]) => void

  dispose: (callback: (data: HotData) => void) => void

  addDisposeHandler: (callback: (data: object) => void) => void

  removeDisposeHandler: (callback: (data: object) => void) => void

  invalidate: () => void

  status: () => 'idle'
  addStatusHandler: (handler: () => void) => void
  removeStatusHandler: (handler: () => void) => void
  check: () => Promise<null>
}

interface HotModule extends Module {
  id: string
  hot: Hot
  parents: ModuleId[]
  children: ModuleId[]
}

// ============================================================================
// HMR Update Protocol Types (matching browser runtime)
// ============================================================================

type ModuleFactoryString = string

interface EcmascriptModuleEntry {
  code: ModuleFactoryString
  url: string
  map?: string
}

interface EcmascriptMergedUpdate {
  type: 'EcmascriptMergedUpdate'
  entries?: Record<ModuleId, EcmascriptModuleEntry>
  chunks?: Record<string, EcmascriptMergedChunkUpdate>
}

interface EcmascriptMergedChunkUpdate {
  type: 'added' | 'deleted' | 'partial'
  modules?: ModuleId[]
  added?: ModuleId[]
  deleted?: ModuleId[]
}

interface ChunkListUpdate {
  type: 'ChunkListUpdate'
  merged?: EcmascriptMergedUpdate[]
}

interface PartialUpdate {
  type: 'partial'
  instruction: ChunkListUpdate
}

interface ServerHmrUpdate {
  type: 'partial' | 'restart' | 'issues'
  instruction?: ChunkListUpdate
}

// ============================================================================
// Context and Module Setup
// ============================================================================

interface TurbopackNodeDevContext extends TurbopackBaseContext<HotModule> {
  R: ResolvePathFromModule
  x: ExternalRequire
  y: ExternalImport
}

const nodeDevContextPrototype = Context.prototype as TurbopackNodeDevContext

type ModuleFactory = (
  this: Module['exports'],
  context: TurbopackNodeDevContext
) => unknown

const url = require('url') as typeof import('url')

const moduleFactories: ModuleFactories = new Map()
nodeDevContextPrototype.M = moduleFactories
const devModuleCache: ModuleCache<HotModule> = Object.create(null)
nodeDevContextPrototype.c = devModuleCache

// ============================================================================
// HMR State
// ============================================================================

/**
 * Maps module IDs to persisted data between executions of their hot module
 * implementation (`hot.data`).
 */
const moduleHotData: Map<ModuleId, HotData> = new Map()

/**
 * Maps module instances to their hot module state.
 */
const moduleHotState: Map<HotModule, HotState> = new Map()

/**
 * Modules that call `module.hot.invalidate()` (while being updated).
 */
const queuedInvalidatedModules: Set<ModuleId> = new Set()

/**
 * Module IDs that are instantiated as part of the runtime of a chunk.
 */
const runtimeModules: Set<ModuleId> = new Set()

/**
 * When true, modules that bubble up to the root without being accepted
 * will be auto-accepted. This is useful for server-side HMR where all
 * server components should accept updates by default.
 *
 * This can be enabled/disabled via globalThis.__turbopack_server_hmr_auto_accept__
 */
let serverHmrAutoAccept: boolean = true

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Returns an absolute path to the given module's id.
 */
function resolvePathFromModule(
  this: TurbopackBaseContext<HotModule>,
  moduleId: string
): string {
  const exported = this.r(moduleId)
  const exportedPath = exported?.default ?? exported
  if (typeof exportedPath !== 'string') {
    return exported as any
  }

  const strippedAssetPrefix = exportedPath.slice(ASSET_PREFIX.length)
  const resolved = path.resolve(RUNTIME_ROOT, strippedAssetPrefix)

  return url.pathToFileURL(resolved).href
}
nodeDevContextPrototype.R = resolvePathFromModule

// ============================================================================
// Chunk Loading (same as production runtime)
// ============================================================================

function loadRuntimeChunk(sourcePath: ChunkPath, chunkData: ChunkData): void {
  if (typeof chunkData === 'string') {
    loadRuntimeChunkPath(sourcePath, chunkData)
  } else {
    loadRuntimeChunkPath(sourcePath, chunkData.path)
  }
}

const loadedChunks = new Set<ChunkPath>()
const unsupportedLoadChunk = Promise.resolve(undefined)
const loadedChunk: Promise<void> = Promise.resolve(undefined)
const chunkCache = new Map<ChunkPath, Promise<void>>()

function clearChunkCache() {
  chunkCache.clear()
}

function loadRuntimeChunkPath(
  sourcePath: ChunkPath,
  chunkPath: ChunkPath
): void {
  if (!isJs(chunkPath)) {
    return
  }

  if (loadedChunks.has(chunkPath)) {
    return
  }

  try {
    const resolved = path.resolve(RUNTIME_ROOT, chunkPath)
    const chunkModules: CompressedModuleFactories = require(resolved)
    installCompressedModuleFactories(chunkModules, 0, moduleFactories)
    loadedChunks.add(chunkPath)
  } catch (cause) {
    let errorMessage = `Failed to load chunk ${chunkPath}`

    if (sourcePath) {
      errorMessage += ` from runtime for chunk ${sourcePath}`
    }

    const error = new Error(errorMessage, { cause })
    error.name = 'ChunkLoadError'
    throw error
  }
}

function loadChunkAsync(
  this: TurbopackBaseContext<HotModule>,
  chunkData: ChunkData
): Promise<void> {
  const chunkPath = typeof chunkData === 'string' ? chunkData : chunkData.path
  if (!isJs(chunkPath)) {
    return unsupportedLoadChunk
  }

  let entry = chunkCache.get(chunkPath)
  if (entry === undefined) {
    try {
      const resolved = path.resolve(RUNTIME_ROOT, chunkPath)
      const chunkModules: CompressedModuleFactories = require(resolved)
      installCompressedModuleFactories(chunkModules, 0, moduleFactories)
      entry = loadedChunk
    } catch (cause) {
      const errorMessage = `Failed to load chunk ${chunkPath} from module ${this.m.id}`
      const error = new Error(errorMessage, { cause })
      error.name = 'ChunkLoadError'
      entry = Promise.reject(error)
    }
    chunkCache.set(chunkPath, entry)
  }
  return entry
}
contextPrototype.l = loadChunkAsync

function loadChunkAsyncByUrl(
  this: TurbopackBaseContext<HotModule>,
  chunkUrl: string
) {
  const chunkPath = url.fileURLToPath(
    new URL(chunkUrl, RUNTIME_ROOT)
  ) as ChunkPath
  return loadChunkAsync.call(this, chunkPath)
}
contextPrototype.L = loadChunkAsyncByUrl

function loadWebAssembly(
  chunkPath: ChunkPath,
  _edgeModule: () => WebAssembly.Module,
  imports: WebAssembly.Imports
) {
  const resolved = path.resolve(RUNTIME_ROOT, chunkPath)
  return instantiateWebAssemblyFromPath(resolved, imports)
}
contextPrototype.w = loadWebAssembly

function loadWebAssemblyModule(
  chunkPath: ChunkPath,
  _edgeModule: () => WebAssembly.Module
) {
  const resolved = path.resolve(RUNTIME_ROOT, chunkPath)
  return compileWebAssemblyFromPath(resolved)
}
contextPrototype.u = loadWebAssemblyModule

function getWorkerBlobURL(_chunks: ChunkPath[]): string {
  throw new Error('Worker blobs are not implemented yet for Node.js')
}

nodeDevContextPrototype.b = getWorkerBlobURL

const regexJsUrl = /\.js(?:\?[^#]*)?(?:#.*)?$/
function isJs(chunkUrlOrPath: ChunkUrl | ChunkPath): boolean {
  return regexJsUrl.test(chunkUrlOrPath)
}

// ============================================================================
// HMR: module.hot API
// ============================================================================

function createModuleHot(
  moduleId: ModuleId,
  hotData: HotData
): { hot: Hot; hotState: HotState } {
  const hotState: HotState = {
    selfAccepted: false,
    selfDeclined: false,
    selfInvalidated: false,
    disposeHandlers: [],
  }

  const hot: Hot = {
    active: true,

    data: hotData ?? {},

    accept: (
      modules?: string | string[] | AcceptErrorHandler,
      _callback?: () => void,
      _errorHandler?: AcceptErrorHandler
    ) => {
      if (modules === undefined) {
        hotState.selfAccepted = true
      } else if (typeof modules === 'function') {
        hotState.selfAccepted = modules
      } else {
        throw new Error('unsupported `accept` signature')
      }
    },

    decline: (dep) => {
      if (dep === undefined) {
        hotState.selfDeclined = true
      } else {
        throw new Error('unsupported `decline` signature')
      }
    },

    dispose: (callback) => {
      hotState.disposeHandlers.push(callback)
    },

    addDisposeHandler: (callback) => {
      hotState.disposeHandlers.push(callback)
    },

    removeDisposeHandler: (callback) => {
      const idx = hotState.disposeHandlers.indexOf(callback)
      if (idx >= 0) {
        hotState.disposeHandlers.splice(idx, 1)
      }
    },

    invalidate: () => {
      hotState.selfInvalidated = true
      queuedInvalidatedModules.add(moduleId)
    },

    status: () => 'idle',
    addStatusHandler: (_handler) => {},
    removeStatusHandler: (_handler) => {},
    check: () => Promise.resolve(null),
  }

  return { hot, hotState }
}

// ============================================================================
// Module Instantiation
// ============================================================================

function instantiateModule(
  moduleId: ModuleId,
  sourceType: SourceType,
  sourceData: SourceData
): HotModule {
  const id = moduleId as string

  const moduleFactory = moduleFactories.get(id)
  if (typeof moduleFactory !== 'function') {
    let instantiationReason: string
    switch (sourceType) {
      case SourceType.Runtime:
        instantiationReason = `as a runtime entry of chunk ${sourceData}`
        break
      case SourceType.Parent:
        instantiationReason = `because it was required from module ${sourceData}`
        break
      case SourceType.Update:
        instantiationReason = `because of an HMR update`
        break
      default:
        invariant(
          sourceType,
          (sourceType) => `Unknown source type: ${sourceType}`
        )
    }
    throw new Error(
      `Module ${id} was instantiated ${instantiationReason}, but the module factory is not available. It might have been deleted in an HMR update.`
    )
  }

  const hotData = moduleHotData.get(id)!
  const { hot, hotState } = createModuleHot(id, hotData)

  let parents: ModuleId[]
  switch (sourceType) {
    case SourceType.Runtime:
      runtimeModules.add(id)
      parents = []
      break
    case SourceType.Parent:
      parents = [sourceData as ModuleId]
      break
    case SourceType.Update:
      parents = (sourceData as ModuleId[]) || []
      break
    default:
      invariant(
        sourceType,
        (sourceType) => `Unknown source type: ${sourceType}`
      )
  }

  const module: HotModule = createModuleObject(id) as HotModule
  const exports = module.exports
  module.parents = parents
  module.children = []
  module.hot = hot

  devModuleCache[id] = module
  moduleHotState.set(module, hotState)

  const context = new (Context as any)(module, exports)

  try {
    moduleFactory(context, module, exports)
  } catch (error) {
    module.error = error as any
    throw error
  }

  if (module.namespaceObject && module.exports !== module.namespaceObject) {
    interopEsm(module.exports, module.namespaceObject)
  }

  return module
}

/**
 * Retrieves a module from the cache, or instantiate it if it is not cached.
 */
// @ts-ignore
function getOrInstantiateModuleFromParent(
  id: ModuleId,
  sourceModule: HotModule
): HotModule {
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

function instantiateRuntimeModule(
  chunkPath: ChunkPath,
  moduleId: ModuleId
): HotModule {
  return instantiateModule(moduleId, SourceType.Runtime, chunkPath)
}

// @ts-ignore
function getOrInstantiateRuntimeModule(
  chunkPath: ChunkPath,
  moduleId: ModuleId
): HotModule {
  const module = devModuleCache[moduleId]
  if (module) {
    if (module.error) {
      throw module.error
    }
    return module
  }

  return instantiateRuntimeModule(chunkPath, moduleId)
}

// ============================================================================
// HMR: Module Disposal
// ============================================================================

/**
 * Disposes of an instance of a module.
 */
function disposeModule(moduleId: ModuleId, mode: 'clear' | 'replace') {
  const module = devModuleCache[moduleId]
  if (!module) {
    return
  }

  const hotState = moduleHotState.get(module)!
  const data = {}

  // Run the `hot.dispose` handler, if any, passing in the persistent
  // `hot.data` object.
  for (const disposeHandler of hotState.disposeHandlers) {
    disposeHandler(data)
  }

  // This used to warn in `getOrInstantiateModuleFromParent` when a disposed
  // module is still importing other modules.
  module.hot.active = false

  moduleHotState.delete(module)

  // Remove the disposed module from its children's parent list.
  for (const childId of module.children) {
    const child = devModuleCache[childId]
    if (!child) {
      continue
    }

    const idx = child.parents.indexOf(module.id)
    if (idx >= 0) {
      child.parents.splice(idx, 1)
    }
  }

  switch (mode) {
    case 'clear':
      delete devModuleCache[module.id]
      moduleHotData.delete(module.id)
      break
    case 'replace':
      moduleHotData.set(module.id, data)
      break
    default:
      invariant(mode, (mode) => `invalid mode: ${mode}`)
  }
}

// ============================================================================
// HMR: Update Application
// ============================================================================

class UpdateApplyError extends Error {
  name = 'UpdateApplyError'
  dependencyChain: ModuleId[]

  constructor(message: string, dependencyChain: ModuleId[]) {
    super(message)
    this.dependencyChain = dependencyChain
  }
}

type AffectedModuleEffect =
  | { type: 'unaccepted'; dependencyChain: ModuleId[] }
  | { type: 'self-declined'; dependencyChain: ModuleId[] }
  | { type: 'accepted'; outdatedModules: Set<ModuleId> }

/**
 * Traverses the module graph to find which modules need to be updated.
 */
function getAffectedModuleEffects(moduleId: ModuleId): AffectedModuleEffect {
  const outdatedModules: Set<ModuleId> = new Set()

  type QueueItem = { moduleId: ModuleId; dependencyChain: ModuleId[] }

  const queue: QueueItem[] = [
    {
      moduleId,
      dependencyChain: [],
    },
  ]

  while (queue.length > 0) {
    const { moduleId, dependencyChain } = queue.shift()!
    const newDependencyChain = [...dependencyChain, moduleId]

    outdatedModules.add(moduleId)

    const module = devModuleCache[moduleId]
    if (!module) {
      // Module not in cache, newly added
      continue
    }

    const hotState = moduleHotState.get(module)
    if (hotState?.selfAccepted) {
      // Module accepts itself
      continue
    }

    if (hotState?.selfDeclined) {
      return { type: 'self-declined', dependencyChain: newDependencyChain }
    }

    if (runtimeModules.has(moduleId)) {
      // Reached a runtime module that doesn't accept itself
      return { type: 'unaccepted', dependencyChain: newDependencyChain }
    }

    // Propagate to parents
    for (const parentId of module.parents) {
      queue.push({
        moduleId: parentId,
        dependencyChain: newDependencyChain,
      })
    }

    // If no parents and not a runtime module, check if we should auto-accept
    if (module.parents.length === 0) {
      if (serverHmrAutoAccept) {
        // In server HMR mode with auto-accept enabled, treat root modules as self-accepting
        // This allows server component updates to be applied without explicit module.hot.accept()
        continue
      }
      return { type: 'unaccepted', dependencyChain: newDependencyChain }
    }
  }

  return { type: 'accepted', outdatedModules }
}

function formatDependencyChain(dependencyChain: ModuleId[]): string {
  return `Dependency chain: ${dependencyChain.join(' -> ')}`
}

/**
 * Evaluates a module factory string to a function.
 */
function _eval(entry: EcmascriptModuleEntry): ModuleFactory {
  // We use indirect eval to avoid capturing local scope
  // eslint-disable-next-line no-eval
  return eval(entry.code)
}

/**
 * Computes which modules are outdated and creates new factories.
 */
function computeOutdatedModules(
  modified: Map<ModuleId, EcmascriptModuleEntry>
): {
  outdatedModules: Set<ModuleId>
  newModuleFactories: Map<ModuleId, ModuleFactory>
} {
  const newModuleFactories = new Map<ModuleId, ModuleFactory>()
  const outdatedModules = new Set<ModuleId>()

  for (const [moduleId, entry] of modified) {
    newModuleFactories.set(moduleId, _eval(entry))

    const effect = getAffectedModuleEffects(moduleId)

    switch (effect.type) {
      case 'unaccepted':
        throw new UpdateApplyError(
          `cannot apply update: unaccepted module. ${formatDependencyChain(
            effect.dependencyChain
          )}.`,
          effect.dependencyChain
        )
      case 'self-declined':
        throw new UpdateApplyError(
          `cannot apply update: self-declined module. ${formatDependencyChain(
            effect.dependencyChain
          )}.`,
          effect.dependencyChain
        )
      case 'accepted':
        for (const outdatedModuleId of effect.outdatedModules) {
          outdatedModules.add(outdatedModuleId)
        }
        break
      default:
        invariant(
          effect,
          (effect) => `Unknown effect type: ${(effect as any)?.type}`
        )
    }
  }

  return { outdatedModules, newModuleFactories }
}

function computeOutdatedSelfAcceptedModules(
  outdatedModules: Iterable<ModuleId>
): { moduleId: ModuleId; errorHandler: true | Function }[] {
  const outdatedSelfAcceptedModules: {
    moduleId: ModuleId
    errorHandler: true | Function
  }[] = []

  for (const moduleId of outdatedModules) {
    const module = devModuleCache[moduleId]
    if (!module) continue

    const hotState = moduleHotState.get(module)
    const isSelfAccepted = hotState?.selfAccepted && !hotState?.selfInvalidated

    // In server HMR auto-accept mode, treat root modules (no parents) as self-accepting
    const isAutoAcceptedRoot =
      serverHmrAutoAccept && module.parents.length === 0

    if (isSelfAccepted || isAutoAcceptedRoot) {
      outdatedSelfAcceptedModules.push({
        moduleId,
        errorHandler: hotState?.selfAccepted || true,
      })
    }
  }

  return outdatedSelfAcceptedModules
}

function disposePhase(outdatedModules: Iterable<ModuleId>): {
  outdatedModuleParents: Map<ModuleId, Array<ModuleId>>
} {
  for (const moduleId of outdatedModules) {
    disposeModule(moduleId, 'replace')
  }

  const outdatedModuleParents = new Map<ModuleId, Array<ModuleId>>()
  for (const moduleId of outdatedModules) {
    const oldModule = devModuleCache[moduleId]
    outdatedModuleParents.set(moduleId, oldModule?.parents || [])
    delete devModuleCache[moduleId]
  }

  return { outdatedModuleParents }
}

function applyPhase(
  outdatedSelfAcceptedModules: {
    moduleId: ModuleId
    errorHandler: true | Function
  }[],
  newModuleFactories: Map<ModuleId, ModuleFactory>,
  outdatedModuleParents: Map<ModuleId, Array<ModuleId>>,
  reportError: (err: any) => void
) {
  // Update module factories
  for (const [moduleId, factory] of newModuleFactories.entries()) {
    moduleFactories.set(moduleId, factory)
  }

  // Re-instantiate all outdated self-accepted modules
  for (const { moduleId, errorHandler } of outdatedSelfAcceptedModules) {
    try {
      instantiateModule(
        moduleId,
        SourceType.Update,
        outdatedModuleParents.get(moduleId) || []
      )
    } catch (err) {
      if (typeof errorHandler === 'function') {
        try {
          errorHandler(err as Error, {
            moduleId,
            module: devModuleCache[moduleId],
          })
        } catch (err2) {
          reportError(err2)
          reportError(err)
        }
      } else {
        reportError(err)
      }
    }
  }
}

function applyInvalidatedModules(
  outdatedModules: Set<ModuleId>
): Set<ModuleId> {
  if (queuedInvalidatedModules.size > 0) {
    for (const moduleId of queuedInvalidatedModules) {
      const effect = getAffectedModuleEffects(moduleId)
      if (effect.type === 'accepted') {
        for (const outdatedModuleId of effect.outdatedModules) {
          outdatedModules.add(outdatedModuleId)
        }
      }
    }
    queuedInvalidatedModules.clear()
  }

  return outdatedModules
}

function applyInternal(
  outdatedModules: Set<ModuleId>,
  newModuleFactories: Map<ModuleId, ModuleFactory>
) {
  outdatedModules = applyInvalidatedModules(outdatedModules)

  const outdatedSelfAcceptedModules =
    computeOutdatedSelfAcceptedModules(outdatedModules)

  const { outdatedModuleParents } = disposePhase(outdatedModules)

  let error: any

  function reportError(err: any) {
    if (!error) error = err
  }

  applyPhase(
    outdatedSelfAcceptedModules,
    newModuleFactories,
    outdatedModuleParents,
    reportError
  )

  if (error) {
    throw error
  }

  if (queuedInvalidatedModules.size > 0) {
    applyInternal(new Set(), new Map())
  }
}

/**
 * Applies an EcmascriptMergedUpdate to the runtime.
 *
 * Returns true if the update was applied successfully, false if a full reload is needed.
 */
function applyEcmascriptMergedUpdate(update: EcmascriptMergedUpdate): boolean {
  const { entries = {} } = update

  const modified = new Map<ModuleId, EcmascriptModuleEntry>()

  for (const [moduleId, entry] of Object.entries(entries)) {
    if (devModuleCache[moduleId]) {
      // Module exists, this is a modification
      modified.set(moduleId, entry)
    } else {
      // New module, just add the factory
      moduleFactories.set(moduleId, _eval(entry))
    }
  }

  if (modified.size === 0) {
    // Only new modules, no updates needed
    return true
  }

  try {
    const { outdatedModules, newModuleFactories } =
      computeOutdatedModules(modified)
    applyInternal(outdatedModules, newModuleFactories)
    return true
  } catch (err) {
    if (err instanceof UpdateApplyError) {
      console.warn(
        '[Server HMR] Update cannot be applied:',
        err.message,
        '\nA full reload is required.'
      )
      return false
    }
    throw err
  }
}

/**
 * Main entry point for applying HMR updates.
 *
 * Returns true if the update was applied successfully, false if a full reload is needed.
 */
function applyUpdate(update: ServerHmrUpdate): boolean {
  if (update.type !== 'partial') {
    return false
  }

  const instruction = update.instruction
  if (!instruction || instruction.type !== 'ChunkListUpdate') {
    return false
  }

  if (instruction.merged) {
    for (const merged of instruction.merged) {
      if (merged.type === 'EcmascriptMergedUpdate') {
        if (!applyEcmascriptMergedUpdate(merged)) {
          return false
        }
      }
    }
  }

  return true
}

// ============================================================================
// Exports
// ============================================================================

// Export for Next.js to call from hot-reloader
declare global {
  var __turbopack_server_hmr_apply__: typeof applyUpdate
  var __turbopack_clear_chunk_cache__: typeof clearChunkCache
}

globalThis.__turbopack_server_hmr_apply__ = applyUpdate
globalThis.__turbopack_clear_chunk_cache__ = clearChunkCache

module.exports = (sourcePath: ChunkPath) => ({
  m: (id: ModuleId) => getOrInstantiateRuntimeModule(sourcePath, id),
  c: (chunkData: ChunkData) => loadRuntimeChunk(sourcePath, chunkData),
})

/// <reference path="./runtime-utils.ts" />
/// <reference path="./runtime-types.d.ts" />
/// <reference path="./dev-extensions.ts" />
/// <reference path="./dev-protocol.d.ts" />

type HotModuleFactoryFunction = ModuleFactoryFunction<
  HotModule,
  TurbopackBaseContext<HotModule>
>

/**
 * Shared HMR (Hot Module Replacement) implementation.
 *
 * This file contains the complete HMR implementation that's shared between
 * browser and Node.js runtimes. It manages module hot state, dependency
 * tracking, the module.hot API, and the full HMR update flow.
 */

/**
 * The development module cache shared across the runtime.
 * Browser runtime declares this directly.
 * Node.js runtime assigns globalThis.__turbopack_module_cache__ to this.
 */
let devModuleCache: Record<ModuleId, any>

/**
 * Module IDs that are instantiated as part of the runtime of a chunk.
 */
let runtimeModules: Set<ModuleId>

/**
 * Maps module IDs to persisted data between executions of their hot module
 * implementation (`hot.data`).
 */
const moduleHotData: Map<ModuleId, HotData> = new Map()

/**
 * Maps module instances to their hot module state.
 * Uses WeakMap so it works with both HotModule and ModuleWithDirection.
 */
const moduleHotState: WeakMap<any, HotState> = new WeakMap()

/**
 * Modules that call `module.hot.invalidate()` (while being updated).
 */
const queuedInvalidatedModules: Set<ModuleId> = new Set()

class UpdateApplyError extends Error {
  name = 'UpdateApplyError'

  dependencyChain: ModuleId[]

  constructor(message: string, dependencyChain: ModuleId[]) {
    super(message)
    this.dependencyChain = dependencyChain
  }
}

type ModuleEffect =
  | {
      type: 'unaccepted'
      dependencyChain: ModuleId[]
    }
  | {
      type: 'self-declined'
      dependencyChain: ModuleId[]
      moduleId: ModuleId
    }
  | {
      type: 'accepted'
      moduleId: ModuleId
      outdatedModules: Set<ModuleId>
    }

/**
 * Records parent-child relationship when a module imports another.
 * Should be called during module instantiation.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function trackModuleImport(
  parentModule: ModuleWithDirection,
  childModuleId: ModuleId,
  childModule: ModuleWithDirection | undefined
): void {
  // Record that parent imports child
  if (parentModule.children.indexOf(childModuleId) === -1) {
    parentModule.children.push(childModuleId)
  }

  // Record that child is imported by parent
  if (childModule && childModule.parents.indexOf(parentModule.id) === -1) {
    childModule.parents.push(parentModule.id)
  }
}

function formatDependencyChain(dependencyChain: ModuleId[]): string {
  return `Dependency chain: ${dependencyChain.join(' -> ')}`
}

/**
 * Walks the dependency tree to find all modules affected by a change.
 * Returns information about whether the update can be accepted and which
 * modules need to be invalidated.
 *
 * @param moduleId - The module that changed
 * @param autoAcceptRootModules - If true, root modules auto-accept updates without explicit module.hot.accept().
 *                           This is used for server-side HMR where pages auto-accept at the top level.
 */
function getAffectedModuleEffects(
  moduleId: ModuleId,
  autoAcceptRootModules: boolean
): ModuleEffect {
  const outdatedModules: Set<ModuleId> = new Set()

  type QueueItem = { moduleId?: ModuleId; dependencyChain: ModuleId[] }

  const queue: QueueItem[] = [
    {
      moduleId,
      dependencyChain: [],
    },
  ]

  let nextItem
  while ((nextItem = queue.shift())) {
    const { moduleId, dependencyChain } = nextItem

    if (moduleId != null) {
      if (outdatedModules.has(moduleId)) {
        // Avoid infinite loops caused by cycles between modules in the dependency chain.
        continue
      }

      outdatedModules.add(moduleId)
    }

    // We've arrived at the runtime of the chunk, which means that nothing
    // else above can accept this update.
    if (moduleId === undefined) {
      if (autoAcceptRootModules) {
        return {
          type: 'accepted',
          moduleId,
          outdatedModules,
        }
      }
      return {
        type: 'unaccepted',
        dependencyChain,
      }
    }

    const module = devModuleCache[moduleId]
    const hotState = moduleHotState.get(module)!

    if (
      // The module is not in the cache. Since this is a "modified" update,
      // it means that the module was never instantiated before.
      !module || // The module accepted itself without invalidating globalThis.
      // TODO is that right?
      (hotState.selfAccepted && !hotState.selfInvalidated)
    ) {
      continue
    }

    if (hotState.selfDeclined) {
      return {
        type: 'self-declined',
        dependencyChain,
        moduleId,
      }
    }

    if (runtimeModules.has(moduleId)) {
      if (autoAcceptRootModules) {
        continue
      }
      queue.push({
        moduleId: undefined,
        dependencyChain: [...dependencyChain, moduleId],
      })
      continue
    }

    for (const parentId of module.parents) {
      const parent = devModuleCache[parentId]

      if (!parent) {
        // TODO(alexkirsz) Is this even possible?
        continue
      }

      // TODO(alexkirsz) Dependencies: check accepted and declined
      // dependencies here.

      queue.push({
        moduleId: parentId,
        dependencyChain: [...dependencyChain, moduleId],
      })
    }

    // If no parents and we're at a root module, auto-accept if configured
    if (module.parents.length === 0 && autoAcceptRootModules) {
      continue
    }
  }

  return {
    type: 'accepted',
    moduleId,
    outdatedModules,
  }
}

/**
 * Computes all modules that need to be invalidated based on which modules changed.
 *
 * @param invalidated - The modules that have been invalidated
 * @param autoAcceptRootModules - If true, root modules auto-accept updates without explicit module.hot.accept()
 */
function computedInvalidatedModules(
  invalidated: Iterable<ModuleId>,
  autoAcceptRootModules: boolean
): Set<ModuleId> {
  const outdatedModules = new Set<ModuleId>()

  for (const moduleId of invalidated) {
    const effect = getAffectedModuleEffects(moduleId, autoAcceptRootModules)

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
      // TODO(alexkirsz) Dependencies: handle dependencies effects.
      default:
        invariant(effect, (effect) => `Unknown effect type: ${effect?.type}`)
    }
  }

  return outdatedModules
}

/**
 * Creates the module.hot API object and its internal state.
 * This provides the HMR API that user code calls (module.hot.accept(), etc.)
 */

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
    // TODO(alexkirsz) This is not defined in the HMR API. It was used to
    // decide whether to warn whenever an HMR-disposed module required other
    // modules. We might want to remove it.
    active: true,

    data: hotData ?? {},

    // TODO(alexkirsz) Support full (dep, callback, errorHandler) form.
    accept: (
      modules?: string | string[] | AcceptErrorHandler,
      _callback?: AcceptCallback,
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

    // NOTE(alexkirsz) This is part of the management API, which we don't
    // implement, but the Next.js React Refresh runtime uses this to decide
    // whether to schedule an update.
    status: () => 'idle',

    // NOTE(alexkirsz) Since we always return "idle" for now, these are no-ops.
    addStatusHandler: (_handler) => {},
    removeStatusHandler: (_handler) => {},

    // NOTE(jridgewell) Check returns the list of updated modules, but we don't
    // want the webpack code paths to ever update (the turbopack paths handle
    // this already).
    check: () => Promise.resolve(null),
  }

  return { hot, hotState }
}

/**
 * Processes queued invalidated modules and adds them to the outdated modules set.
 * Modules that call module.hot.invalidate() are queued and processed here.
 *
 * @param outdatedModules - The current set of outdated modules
 * @param autoAcceptRootModules - If true, root modules auto-accept updates without explicit module.hot.accept()
 */
function applyInvalidatedModules(
  outdatedModules: Set<ModuleId>,
  autoAcceptRootModules: boolean
): Set<ModuleId> {
  if (queuedInvalidatedModules.size > 0) {
    computedInvalidatedModules(
      queuedInvalidatedModules,
      autoAcceptRootModules
    ).forEach((moduleId) => {
      outdatedModules.add(moduleId)
    })

    queuedInvalidatedModules.clear()
  }

  return outdatedModules
}

/**
 * Computes which outdated modules have self-accepted and can be hot reloaded.
 */

function computeOutdatedSelfAcceptedModules(
  outdatedModules: Iterable<ModuleId>
): { moduleId: ModuleId; errorHandler: true | Function }[] {
  const outdatedSelfAcceptedModules: {
    moduleId: ModuleId
    errorHandler: true | Function
  }[] = []
  for (const moduleId of outdatedModules) {
    const module = devModuleCache[moduleId]
    const hotState = moduleHotState.get(module)
    if (module && hotState?.selfAccepted && !hotState.selfInvalidated) {
      outdatedSelfAcceptedModules.push({
        moduleId,
        errorHandler: hotState.selfAccepted,
      })
    }
  }
  return outdatedSelfAcceptedModules
}

/**
 * Disposes of an instance of a module.
 * Runs hot.dispose handlers and manages persistent hot data.
 *
 * NOTE: mode = "replace" will not remove modules from devModuleCache.
 * This must be done in a separate step afterwards.
 */
function disposeModule(moduleId: ModuleId, mode: 'clear' | 'replace') {
  const module = devModuleCache[moduleId]
  if (!module) {
    return
  }

  const hotState = moduleHotState.get(module)
  if (!hotState) {
    return
  }

  const data: HotData = {}

  // Run the `hot.dispose` handler, if any, passing in the persistent
  // `hot.data` object.
  for (const disposeHandler of hotState.disposeHandlers) {
    disposeHandler(data)
  }

  // This used to warn in `getOrInstantiateModuleFromParent` when a disposed
  // module is still importing other modules.
  if (module.hot) {
    module.hot.active = false
  }

  moduleHotState.delete(module)

  // TODO(alexkirsz) Dependencies: delete the module from outdated deps.

  // Remove the disposed module from its children's parent list.
  // It will be added back once the module re-instantiates and imports its
  // children again.
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

/**
 * Dispose phase: runs dispose handlers and cleans up outdated/disposed modules.
 * Returns the parent modules of outdated modules for use in the apply phase.
 */

function disposePhase(
  outdatedModules: Iterable<ModuleId>,
  disposedModules: Iterable<ModuleId>
): { outdatedModuleParents: Map<ModuleId, Array<ModuleId>> } {
  for (const moduleId of outdatedModules) {
    disposeModule(moduleId, 'replace')
  }

  for (const moduleId of disposedModules) {
    disposeModule(moduleId, 'clear')
  }

  // Removing modules from the module cache is a separate step.
  // We also want to keep track of previous parents of the outdated modules.
  const outdatedModuleParents = new Map<ModuleId, Array<ModuleId>>()
  for (const moduleId of outdatedModules) {
    const oldModule = devModuleCache[moduleId]
    outdatedModuleParents.set(moduleId, oldModule?.parents)
    delete devModuleCache[moduleId]
  }

  // TODO(alexkirsz) Dependencies: remove outdated dependency from module
  // children.

  return { outdatedModuleParents }
}

/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Shared module instantiation logic.
 * This handles the full module instantiation flow for both browser and Node.js.
 * Only React Refresh hooks differ between platforms (passed as callback).
 */
function instantiateModuleShared(
  moduleId: ModuleId,
  sourceType: SourceType,
  sourceData: SourceData,
  moduleFactories: ModuleFactories,
  devModuleCache: ModuleCache<HotModule>,
  runtimeModules: Set<ModuleId>,
  createModuleObjectFn: (id: ModuleId) => HotModule,
  createContextFn: (module: HotModule, exports: Exports, refresh?: any) => any,
  runModuleExecutionHooksFn: (
    module: HotModule,
    exec: (refresh: any) => void
  ) => void
): HotModule {
  // 1. Factory validation (same in both browser and Node.js)
  const id = moduleId as string
  const moduleFactory = moduleFactories.get(id)
  if (typeof moduleFactory !== 'function') {
    throw new Error(
      factoryNotAvailableMessage(moduleId, sourceType, sourceData) +
        `\nThis is often caused by a stale browser cache, misconfigured Cache-Control headers, or a service worker serving outdated responses.` +
        `\nTo fix this, make sure your Cache-Control headers allow revalidation of chunks and review your service worker configuration. ` +
        `As an immediate workaround, try hard-reloading the page, clearing the browser cache, or unregistering any service workers.`
    )
  }

  // 2. Hot API setup (same in both - works for browser, included for Node.js)
  const hotData = moduleHotData.get(id)!
  const { hot, hotState } = createModuleHot(id, hotData)

  // 3. Parent assignment logic (same in both)
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
      throw new Error(`Unknown source type: ${sourceType}`)
  }

  // 4. Module creation (platform creates base module object)
  const module = createModuleObjectFn(id)
  const exports = module.exports
  module.parents = parents
  module.children = []
  module.hot = hot

  devModuleCache[id] = module
  moduleHotState.set(module, hotState)

  // 5. Module execution (React Refresh hooks are platform-specific)
  try {
    runModuleExecutionHooksFn(module, (refresh) => {
      const context = createContextFn(module, exports, refresh)
      moduleFactory.call(exports, context, module, exports)
    })
  } catch (error) {
    module.error = error as any
    throw error
  }

  // 6. ESM interop (same in both)
  if (module.namespaceObject && module.exports !== module.namespaceObject) {
    // in case of a circular dependency: cjs1 -> esm2 -> cjs1
    interopEsm(module.exports, module.namespaceObject)
  }

  return module
}

/**
 * Analyzes update entries and chunks to determine which modules were added, modified, or deleted.
 * This is pure logic that doesn't depend on the runtime environment.
 */
function computeChangedModules(
  entries: Record<ModuleId, EcmascriptModuleEntry>,
  updates: Record<ChunkPath, EcmascriptMergedChunkUpdate>,
  chunkModulesMap?: Map<ChunkPath, Set<ModuleId>>
): {
  added: Map<ModuleId, EcmascriptModuleEntry | undefined>
  modified: Map<ModuleId, EcmascriptModuleEntry>
  deleted: Set<ModuleId>
  chunksAdded: Map<ChunkPath, Set<ModuleId>>
  chunksDeleted: Map<ChunkPath, Set<ModuleId>>
} {
  const chunksAdded = new Map()
  const chunksDeleted = new Map()
  const added: Map<ModuleId, EcmascriptModuleEntry> = new Map()
  const modified = new Map()
  const deleted: Set<ModuleId> = new Set()

  for (const [chunkPath, mergedChunkUpdate] of Object.entries(updates) as Array<
    [ChunkPath, EcmascriptMergedChunkUpdate]
  >) {
    switch (mergedChunkUpdate.type) {
      case 'added': {
        const updateAdded = new Set(mergedChunkUpdate.modules)
        for (const moduleId of updateAdded) {
          added.set(moduleId, entries[moduleId])
        }
        chunksAdded.set(chunkPath, updateAdded)
        break
      }
      case 'deleted': {
        const updateDeleted = chunkModulesMap
          ? new Set(chunkModulesMap.get(chunkPath))
          : new Set<ModuleId>()
        for (const moduleId of updateDeleted) {
          deleted.add(moduleId)
        }
        chunksDeleted.set(chunkPath, updateDeleted)
        break
      }
      case 'partial': {
        const updateAdded = new Set(mergedChunkUpdate.added)
        const updateDeleted = new Set(mergedChunkUpdate.deleted)
        for (const moduleId of updateAdded) {
          added.set(moduleId, entries[moduleId])
        }
        for (const moduleId of updateDeleted) {
          deleted.add(moduleId)
        }
        chunksAdded.set(chunkPath, updateAdded)
        chunksDeleted.set(chunkPath, updateDeleted)
        break
      }
      default:
        throw new Error('Unknown merged chunk update type')
    }
  }

  // If a module was added from one chunk and deleted from another in the same update,
  // consider it to be modified, as it means the module was moved from one chunk to another
  // AND has new code in a single update.
  for (const moduleId of added.keys()) {
    if (deleted.has(moduleId)) {
      added.delete(moduleId)
      deleted.delete(moduleId)
    }
  }

  for (const [moduleId, entry] of Object.entries(entries)) {
    // Modules that haven't been added to any chunk but have new code are considered
    // to be modified.
    // This needs to be under the previous loop, as we need it to get rid of modules
    // that were added and deleted in the same update.
    if (!added.has(moduleId)) {
      modified.set(moduleId, entry)
    }
  }

  return { added, deleted, modified, chunksAdded, chunksDeleted }
}

/**
 * Compiles new module code and walks the dependency tree to find all outdated modules.
 * Uses the evalModuleEntry function to compile code (platform-specific).
 *
 * @param added - Map of added modules
 * @param modified - Map of modified modules
 * @param evalModuleEntry - Function to compile module code
 * @param autoAcceptRootModules - If true, root modules auto-accept updates without explicit module.hot.accept()
 */
function computeOutdatedModules(
  added: Map<ModuleId, EcmascriptModuleEntry | undefined>,
  modified: Map<ModuleId, EcmascriptModuleEntry>,
  evalModuleEntry: (entry: EcmascriptModuleEntry) => HotModuleFactoryFunction,
  autoAcceptRootModules: boolean
): {
  outdatedModules: Set<ModuleId>
  newModuleFactories: Map<ModuleId, HotModuleFactoryFunction>
} {
  const newModuleFactories = new Map<ModuleId, HotModuleFactoryFunction>()

  // Compile added modules
  for (const [moduleId, entry] of added) {
    if (entry != null) {
      newModuleFactories.set(moduleId, evalModuleEntry(entry))
    }
  }

  // Walk dependency tree to find all modules affected by modifications
  const outdatedModules = computedInvalidatedModules(
    modified.keys(),
    autoAcceptRootModules
  )

  // Compile modified modules
  for (const [moduleId, entry] of modified) {
    newModuleFactories.set(moduleId, evalModuleEntry(entry))
  }

  return { outdatedModules, newModuleFactories }
}

/**
 * Updates module factories and re-instantiates self-accepted modules.
 * Uses the instantiateModule function (platform-specific via callback).
 */
function applyPhase(
  outdatedSelfAcceptedModules: {
    moduleId: ModuleId
    errorHandler: true | Function
  }[],
  newModuleFactories: Map<ModuleId, HotModuleFactoryFunction>,
  outdatedModuleParents: Map<ModuleId, Array<ModuleId>>,
  moduleFactories: ModuleFactories,
  devModuleCache: ModuleCache<HotModule>,
  instantiateModuleFn: (
    moduleId: ModuleId,
    sourceType: SourceType,
    sourceData: SourceData
  ) => HotModule,
  applyModuleFactoryNameFn: (factory: HotModuleFactoryFunction) => void,
  reportError: (err: any) => void
) {
  // Update module factories
  for (const [moduleId, factory] of newModuleFactories.entries()) {
    applyModuleFactoryNameFn(factory)
    moduleFactories.set(moduleId, factory)
  }

  // TODO(alexkirsz) Run new runtime entries here.

  // TODO(alexkirsz) Dependencies: call accept handlers for outdated deps.

  // Re-instantiate all outdated self-accepted modules
  for (const { moduleId, errorHandler } of outdatedSelfAcceptedModules) {
    try {
      instantiateModuleFn(
        moduleId,
        SourceType.Update,
        outdatedModuleParents.get(moduleId)
      )
    } catch (err) {
      if (typeof errorHandler === 'function') {
        try {
          errorHandler(err, { moduleId, module: devModuleCache[moduleId] })
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

/**
 * Internal implementation that orchestrates the full HMR update flow:
 * invalidation, disposal, and application of new modules.
 *
 * @param autoAcceptRootModules - If true, root modules auto-accept updates without explicit module.hot.accept()
 */
function applyInternal(
  outdatedModules: Set<ModuleId>,
  disposedModules: Iterable<ModuleId>,
  newModuleFactories: Map<ModuleId, HotModuleFactoryFunction>,
  moduleFactories: ModuleFactories,
  devModuleCache: ModuleCache<HotModule>,
  instantiateModuleFn: (
    moduleId: ModuleId,
    sourceType: SourceType,
    sourceData: SourceData
  ) => HotModule,
  applyModuleFactoryNameFn: (factory: HotModuleFactoryFunction) => void,
  autoAcceptRootModules: boolean
) {
  outdatedModules = applyInvalidatedModules(
    outdatedModules,
    autoAcceptRootModules
  )

  // Find self-accepted modules to re-instantiate
  const outdatedSelfAcceptedModules =
    computeOutdatedSelfAcceptedModules(outdatedModules)

  // Run dispose handlers, save hot.data, clear caches
  const { outdatedModuleParents } = disposePhase(
    outdatedModules,
    disposedModules
  )

  let error: any

  function reportError(err: any) {
    if (!error) error = err // Keep first error
  }

  applyPhase(
    outdatedSelfAcceptedModules,
    newModuleFactories,
    outdatedModuleParents,
    moduleFactories,
    devModuleCache,
    instantiateModuleFn,
    applyModuleFactoryNameFn,
    reportError
  )

  if (error) {
    throw error
  }

  // Recursively apply any queued invalidations from new module execution
  if (queuedInvalidatedModules.size > 0) {
    applyInternal(
      new Set(),
      [],
      new Map(),
      moduleFactories,
      devModuleCache,
      instantiateModuleFn,
      applyModuleFactoryNameFn,
      autoAcceptRootModules
    )
  }
}

/**
 * Main entry point for applying an ECMAScript merged update.
 * This is called by both browser and Node.js runtimes with platform-specific callbacks.
 *
 * @param options.autoAcceptRootModules - If true, root modules auto-accept updates without explicit
 *                                   module.hot.accept(). Used for server-side HMR where pages
 *                                   auto-accept at the top level.
 */
function applyEcmascriptMergedUpdateShared(options: {
  added: Map<ModuleId, EcmascriptModuleEntry | undefined>
  modified: Map<ModuleId, EcmascriptModuleEntry>
  disposedModules: Iterable<ModuleId>
  evalModuleEntry: (entry: EcmascriptModuleEntry) => HotModuleFactoryFunction
  instantiateModule: (
    moduleId: ModuleId,
    sourceType: SourceType,
    sourceData: SourceData
  ) => HotModule
  applyModuleFactoryName: (factory: HotModuleFactoryFunction) => void
  moduleFactories: ModuleFactories
  devModuleCache: ModuleCache<HotModule>
  autoAcceptRootModules: boolean
}) {
  const {
    added,
    modified,
    disposedModules,
    evalModuleEntry,
    instantiateModule,
    applyModuleFactoryName,
    moduleFactories,
    devModuleCache,
    autoAcceptRootModules,
  } = options

  const { outdatedModules, newModuleFactories } = computeOutdatedModules(
    added,
    modified,
    evalModuleEntry,
    autoAcceptRootModules
  )

  applyInternal(
    outdatedModules,
    disposedModules,
    newModuleFactories,
    moduleFactories,
    devModuleCache,
    instantiateModule,
    applyModuleFactoryName,
    autoAcceptRootModules
  )
}

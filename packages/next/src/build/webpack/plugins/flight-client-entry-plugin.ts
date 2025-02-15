import type {
  CssImports,
  ClientComponentImports,
} from '../loaders/next-flight-client-entry-loader'

import { webpack } from 'next/dist/compiled/webpack/webpack'
import { parse, stringify } from 'querystring'
import path from 'path'
import { sources } from 'next/dist/compiled/webpack/webpack'
import {
  getInvalidator,
  getEntries,
  EntryTypes,
  getEntryKey,
} from '../../../server/dev/on-demand-entry-handler'
import {
  WEBPACK_LAYERS,
  WEBPACK_RESOURCE_QUERIES,
} from '../../../lib/constants'
import {
  APP_CLIENT_INTERNALS,
  BARREL_OPTIMIZATION_PREFIX,
  COMPILER_NAMES,
  DEFAULT_RUNTIME_WEBPACK,
  EDGE_RUNTIME_WEBPACK,
  SERVER_REFERENCE_MANIFEST,
  UNDERSCORE_NOT_FOUND_ROUTE_ENTRY,
} from '../../../shared/lib/constants'
import {
  isClientComponentEntryModule,
  isCSSMod,
  regexCSS,
} from '../loaders/utils'
import {
  traverseModules,
  forEachEntryModule,
  formatBarrelOptimizedResource,
  getModuleReferencesInOrder,
} from '../utils'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'
import { getProxiedPluginState } from '../../build-context'
import { PAGE_TYPES } from '../../../lib/page-types'
import { getModuleBuildInfo } from '../loaders/get-module-build-info'
import { getAssumedSourceType } from '../loaders/next-flight-loader'
import { isAppRouteRoute } from '../../../lib/is-app-route-route'
import { isMetadataRoute } from '../../../lib/metadata/is-metadata-route'
import type { MetadataRouteLoaderOptions } from '../loaders/next-metadata-route-loader'
import type { FlightActionEntryLoaderActions } from '../loaders/next-flight-action-entry-loader'

interface Options {
  dev: boolean
  appDir: string
  isEdgeServer: boolean
  encryptionKey: string
}

const PLUGIN_NAME = 'FlightClientEntryPlugin'

type Actions = {
  [actionId: string]: {
    workers: {
      [name: string]: { moduleId: string | number; async: boolean }
    }
    // Record which layer the action is in (rsc or sc_action), in the specific entry.
    layer: {
      [name: string]: string
    }
  }
}

type ActionIdNamePair = { id: string; exportedName: string }

export type ActionManifest = {
  // Assign a unique encryption key during production build.
  encryptionKey: string
  node: Actions
  edge: Actions
}

export interface ModuleInfo {
  moduleId: string | number
  async: boolean
}

const pluginState = getProxiedPluginState({
  // A map to track "action" -> "list of bundles".
  serverActions: {} as ActionManifest['node'],
  edgeServerActions: {} as ActionManifest['edge'],

  serverActionModules: {} as {
    [workerName: string]: { server?: ModuleInfo; client?: ModuleInfo }
  },

  edgeServerActionModules: {} as {
    [workerName: string]: { server?: ModuleInfo; client?: ModuleInfo }
  },

  ssrModules: {} as { [ssrModuleId: string]: ModuleInfo },
  edgeSsrModules: {} as { [ssrModuleId: string]: ModuleInfo },

  rscModules: {} as { [rscModuleId: string]: ModuleInfo },
  edgeRscModules: {} as { [rscModuleId: string]: ModuleInfo },

  injectedClientEntries: {} as Record<string, string>,
})

function deduplicateCSSImportsForEntry(mergedCSSimports: CssImports) {
  // If multiple entry module connections are having the same CSS import,
  // we only need to have one module to keep track of that CSS import.
  // It is based on the fact that if a page or a layout is rendered in the
  // given entry, all its parent layouts are always rendered too.
  // This can avoid duplicate CSS imports in the generated CSS manifest,
  // for example, if a page and its parent layout are both using the same
  // CSS import, we only need to have the layout to keep track of that CSS
  // import.
  // To achieve this, we need to first collect all the CSS imports from
  // every connection, and deduplicate them in the order of layers from
  // top to bottom. The implementation can be generally described as:
  // - Sort by number of `/` in the request path (the more `/`, the deeper)
  // - When in the same depth, sort by the filename (template < layout < page and others)

  // Sort the connections as described above.
  const sortedCSSImports = Object.entries(mergedCSSimports).sort((a, b) => {
    const [aPath] = a
    const [bPath] = b

    const aDepth = aPath.split('/').length
    const bDepth = bPath.split('/').length

    if (aDepth !== bDepth) {
      return aDepth - bDepth
    }

    const aName = path.parse(aPath).name
    const bName = path.parse(bPath).name

    const indexA = ['template', 'layout'].indexOf(aName)
    const indexB = ['template', 'layout'].indexOf(bName)

    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })

  const dedupedCSSImports: CssImports = {}
  const trackedCSSImports = new Set<string>()
  for (const [entryName, cssImports] of sortedCSSImports) {
    for (const cssImport of cssImports) {
      if (trackedCSSImports.has(cssImport)) continue

      // Only track CSS imports that are in files that can inherit CSS.
      const filename = path.parse(entryName).name
      if (['template', 'layout'].includes(filename)) {
        trackedCSSImports.add(cssImport)
      }

      if (!dedupedCSSImports[entryName]) {
        dedupedCSSImports[entryName] = []
      }
      dedupedCSSImports[entryName].push(cssImport)
    }
  }

  return dedupedCSSImports
}

export class FlightClientEntryPlugin {
  dev: boolean
  appDir: string
  encryptionKey: string
  isEdgeServer: boolean
  assetPrefix: string
  webpackRuntime: string

  constructor(options: Options) {
    this.dev = options.dev
    this.appDir = options.appDir
    this.isEdgeServer = options.isEdgeServer
    this.assetPrefix = !this.dev && !this.isEdgeServer ? '../' : ''
    this.encryptionKey = options.encryptionKey
    this.webpackRuntime = this.isEdgeServer
      ? EDGE_RUNTIME_WEBPACK
      : DEFAULT_RUNTIME_WEBPACK
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.finishMake.tapPromise(PLUGIN_NAME, (compilation) =>
      this.createClientEntries(compiler, compilation)
    )

    compiler.hooks.afterCompile.tap(PLUGIN_NAME, (compilation) => {
      const recordModule = (modId: string, mod: any) => {
        // Match Resource is undefined unless an import is using the inline match resource syntax
        // https://webpack.js.org/api/loaders/#inline-matchresource
        const modPath = mod.matchResource || mod.resourceResolveData?.path
        const modQuery = mod.resourceResolveData?.query || ''
        // query is already part of mod.resource
        // so it's only necessary to add it for matchResource or mod.resourceResolveData
        const modResource = modPath
          ? modPath.startsWith(BARREL_OPTIMIZATION_PREFIX)
            ? formatBarrelOptimizedResource(mod.resource, modPath)
            : modPath + modQuery
          : mod.resource

        if (typeof modId !== 'undefined' && modResource) {
          if (mod.layer === WEBPACK_LAYERS.reactServerComponents) {
            const key = path
              .relative(compiler.context, modResource)
              .replace(/\/next\/dist\/esm\//, '/next/dist/')

            const moduleInfo: ModuleInfo = {
              moduleId: modId,
              async: compilation.moduleGraph.isAsync(mod),
            }

            if (this.isEdgeServer) {
              pluginState.edgeRscModules[key] = moduleInfo
            } else {
              pluginState.rscModules[key] = moduleInfo
            }
          }
        }

        if (mod.layer !== WEBPACK_LAYERS.serverSideRendering) {
          return
        }

        // Check mod resource to exclude the empty resource module like virtual module created by next-flight-client-entry-loader
        if (typeof modId !== 'undefined' && modResource) {
          // Note that this isn't that reliable as webpack is still possible to assign
          // additional queries to make sure there's no conflict even using the `named`
          // module ID strategy.
          let ssrNamedModuleId = path.relative(compiler.context, modResource)

          if (!ssrNamedModuleId.startsWith('.')) {
            // TODO use getModuleId instead
            ssrNamedModuleId = `./${normalizePathSep(ssrNamedModuleId)}`
          }

          const moduleInfo: ModuleInfo = {
            moduleId: modId,
            async: compilation.moduleGraph.isAsync(mod),
          }

          if (this.isEdgeServer) {
            pluginState.edgeSsrModules[
              ssrNamedModuleId.replace(/\/next\/dist\/esm\//, '/next/dist/')
            ] = moduleInfo
          } else {
            pluginState.ssrModules[ssrNamedModuleId] = moduleInfo
          }
        }
      }

      traverseModules(compilation, (mod, _chunk, _chunkGroup, modId) => {
        if (modId) recordModule(modId, mod)
      })
    })

    compiler.hooks.make.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tapPromise(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
        },
        () => this.createActionAssets(compilation)
      )
    })
  }

  async createClientEntries(
    compiler: webpack.Compiler,
    compilation: webpack.Compilation
  ) {
    const addClientEntryAndSSRModulesList: Array<
      ReturnType<typeof this.injectClientEntryAndSSRModules>
    > = []
    const createdSSRDependenciesForEntry: Record<
      string,
      ReturnType<typeof this.injectClientEntryAndSSRModules>[3][]
    > = {}

    const addActionEntryList: Array<ReturnType<typeof this.injectActionEntry>> =
      []
    const actionMapsPerEntry: Record<
      string,
      Map<string, ActionIdNamePair[]>
    > = {}
    const createdActionIds = new Set<string>()

    // For each SC server compilation entry, we need to create its corresponding
    // client component entry.
    forEachEntryModule(compilation, ({ name, entryModule }) => {
      const internalClientComponentEntryImports: ClientComponentImports = {}
      const actionEntryImports = new Map<string, ActionIdNamePair[]>()
      const clientEntriesToInject = []
      const mergedCSSimports: CssImports = {}

      for (const connection of getModuleReferencesInOrder(
        entryModule,
        compilation.moduleGraph
      )) {
        // Entry can be any user defined entry files such as layout, page, error, loading, etc.
        let entryRequest = (
          connection.dependency as unknown as webpack.NormalModule
        ).request

        if (entryRequest.endsWith(WEBPACK_RESOURCE_QUERIES.metadataRoute)) {
          const { filePath, isDynamicRouteExtension } =
            getMetadataRouteResource(entryRequest)

          if (isDynamicRouteExtension === '1') {
            entryRequest = filePath
          }
        }

        const { clientComponentImports, actionImports, cssImports } =
          this.collectComponentInfoFromServerEntryDependency({
            entryRequest,
            compilation,
            resolvedModule: connection.resolvedModule,
          })

        actionImports.forEach(([dep, actions]) =>
          actionEntryImports.set(dep, actions)
        )

        const isAbsoluteRequest = path.isAbsolute(entryRequest)

        // Next.js internals are put into a separate entry.
        if (!isAbsoluteRequest) {
          Object.keys(clientComponentImports).forEach(
            (value) => (internalClientComponentEntryImports[value] = new Set())
          )
          continue
        }

        // TODO-APP: Enable these lines. This ensures no entrypoint is created for layout/page when there are no client components.
        // Currently disabled because it causes test failures in CI.
        // if (clientImports.length === 0 && actionImports.length === 0) {
        //   continue
        // }

        const relativeRequest = isAbsoluteRequest
          ? path.relative(compilation.options.context!, entryRequest)
          : entryRequest

        // Replace file suffix as `.js` will be added.
        let bundlePath = normalizePathSep(
          relativeRequest.replace(/\.[^.\\/]+$/, '').replace(/^src[\\/]/, '')
        )

        // For metadata routes, the entry name can be used as the bundle path,
        // as it has been normalized already.
        if (isMetadataRoute(bundlePath)) {
          bundlePath = name
        }

        Object.assign(mergedCSSimports, cssImports)
        clientEntriesToInject.push({
          compiler,
          compilation,
          entryName: name,
          clientComponentImports,
          bundlePath,
          absolutePagePath: entryRequest,
        })

        // The webpack implementation of writing the client reference manifest relies on all entrypoints writing a page.js even when there is no client components in the page.
        // It needs the file in order to write the reference manifest for the path in the `.next/server` folder.
        // TODO-APP: This could be better handled, however Turbopack does not have the same problem as we resolve client components in a single graph.
        if (
          name === `app${UNDERSCORE_NOT_FOUND_ROUTE_ENTRY}` &&
          bundlePath === 'app/not-found'
        ) {
          clientEntriesToInject.push({
            compiler,
            compilation,
            entryName: name,
            clientComponentImports: {},
            bundlePath: `app${UNDERSCORE_NOT_FOUND_ROUTE_ENTRY}`,
            absolutePagePath: entryRequest,
          })
        }
      }

      // Make sure CSS imports are deduplicated before injecting the client entry
      // and SSR modules.
      const dedupedCSSImports = deduplicateCSSImportsForEntry(mergedCSSimports)
      for (const clientEntryToInject of clientEntriesToInject) {
        const injected = this.injectClientEntryAndSSRModules({
          ...clientEntryToInject,
          clientImports: {
            ...clientEntryToInject.clientComponentImports,
            ...(
              dedupedCSSImports[clientEntryToInject.absolutePagePath] || []
            ).reduce<ClientComponentImports>((res, curr) => {
              res[curr] = new Set()
              return res
            }, {}),
          },
        })

        // Track all created SSR dependencies for each entry from the server layer.
        if (!createdSSRDependenciesForEntry[clientEntryToInject.entryName]) {
          createdSSRDependenciesForEntry[clientEntryToInject.entryName] = []
        }
        createdSSRDependenciesForEntry[clientEntryToInject.entryName].push(
          injected[3]
        )

        addClientEntryAndSSRModulesList.push(injected)
      }

      if (!isAppRouteRoute(name)) {
        // Create internal app
        addClientEntryAndSSRModulesList.push(
          this.injectClientEntryAndSSRModules({
            compiler,
            compilation,
            entryName: name,
            clientImports: { ...internalClientComponentEntryImports },
            bundlePath: APP_CLIENT_INTERNALS,
          })
        )
      }

      if (actionEntryImports.size > 0) {
        if (!actionMapsPerEntry[name]) {
          actionMapsPerEntry[name] = new Map()
        }
        actionMapsPerEntry[name] = new Map([
          ...actionMapsPerEntry[name],
          ...actionEntryImports,
        ])
      }
    })

    for (const [name, actionEntryImports] of Object.entries(
      actionMapsPerEntry
    )) {
      addActionEntryList.push(
        this.injectActionEntry({
          compiler,
          compilation,
          actions: actionEntryImports,
          entryName: name,
          bundlePath: name,
          createdActionIds,
        })
      )
    }

    // Invalidate in development to trigger recompilation
    const invalidator = getInvalidator(compiler.outputPath)
    // Check if any of the entry injections need an invalidation
    if (
      invalidator &&
      addClientEntryAndSSRModulesList.some(
        ([shouldInvalidate]) => shouldInvalidate === true
      )
    ) {
      invalidator.invalidate([COMPILER_NAMES.client])
    }

    // Client compiler is invalidated before awaiting the compilation of the SSR
    // and RSC client component entries so that the client compiler is running
    // in parallel to the server compiler.
    await Promise.all(
      addClientEntryAndSSRModulesList.flatMap((addClientEntryAndSSRModules) => [
        addClientEntryAndSSRModules[1],
        addClientEntryAndSSRModules[2],
      ])
    )

    // Wait for action entries to be added.
    await Promise.all(addActionEntryList)

    const addedClientActionEntryList: Promise<any>[] = []
    const actionMapsPerClientEntry: Record<
      string,
      Map<string, ActionIdNamePair[]>
    > = {}

    // We need to create extra action entries that are created from the
    // client layer.
    // Start from each entry's created SSR dependency from our previous step.
    for (const [name, ssrEntryDependencies] of Object.entries(
      createdSSRDependenciesForEntry
    )) {
      // Collect from all entries, e.g. layout.js, page.js, loading.js, ...
      // add aggregate them.
      const actionEntryImports = this.collectClientActionsFromDependencies({
        compilation,
        dependencies: ssrEntryDependencies,
      })

      if (actionEntryImports.size > 0) {
        if (!actionMapsPerClientEntry[name]) {
          actionMapsPerClientEntry[name] = new Map()
        }
        actionMapsPerClientEntry[name] = new Map([
          ...actionMapsPerClientEntry[name],
          ...actionEntryImports,
        ])
      }
    }

    for (const [entryName, actionEntryImports] of Object.entries(
      actionMapsPerClientEntry
    )) {
      // If an action method is already created in the server layer, we don't
      // need to create it again in the action layer.
      // This is to avoid duplicate action instances and make sure the module
      // state is shared.
      let remainingClientImportedActions = false
      const remainingActionEntryImports = new Map<string, ActionIdNamePair[]>()
      for (const [dep, actions] of actionEntryImports) {
        const remainingActionNames = []
        for (const action of actions) {
          if (!createdActionIds.has(entryName + '@' + action.id)) {
            remainingActionNames.push(action)
          }
        }
        if (remainingActionNames.length > 0) {
          remainingActionEntryImports.set(dep, remainingActionNames)
          remainingClientImportedActions = true
        }
      }

      if (remainingClientImportedActions) {
        addedClientActionEntryList.push(
          this.injectActionEntry({
            compiler,
            compilation,
            actions: remainingActionEntryImports,
            entryName,
            bundlePath: entryName,
            fromClient: true,
            createdActionIds,
          })
        )
      }
    }

    await Promise.all(addedClientActionEntryList)
  }

  collectClientActionsFromDependencies({
    compilation,
    dependencies,
  }: {
    compilation: webpack.Compilation
    dependencies: ReturnType<typeof webpack.EntryPlugin.createDependency>[]
  }) {
    // action file path -> action names
    const collectedActions = new Map<string, ActionIdNamePair[]>()

    // Keep track of checked modules to avoid infinite loops with recursive imports.
    const visitedModule = new Set<string>()
    const visitedEntry = new Set<string>()

    const collectActions = ({
      entryRequest,
      resolvedModule,
    }: {
      entryRequest: string
      resolvedModule: any
    }) => {
      const collectActionsInDep = (mod: webpack.NormalModule): void => {
        if (!mod) return

        const modResource = getModuleResource(mod)

        if (!modResource) return

        if (visitedModule.has(modResource)) return
        visitedModule.add(modResource)

        const actionIds = getModuleBuildInfo(mod).rsc?.actionIds
        if (actionIds) {
          collectedActions.set(
            modResource,
            Object.entries(actionIds).map(([id, exportedName]) => ({
              id,
              exportedName,
            }))
          )
        }

        // Collect used exported actions transversely.
        getModuleReferencesInOrder(mod, compilation.moduleGraph).forEach(
          (connection: any) => {
            collectActionsInDep(
              connection.resolvedModule as webpack.NormalModule
            )
          }
        )
      }

      // Don't traverse the module graph anymore once hitting the action layer.
      if (
        entryRequest &&
        !entryRequest.includes('next-flight-action-entry-loader')
      ) {
        // Traverse the module graph to find all client components.
        collectActionsInDep(resolvedModule)
      }
    }

    for (const entryDependency of dependencies) {
      const ssrEntryModule =
        compilation.moduleGraph.getResolvedModule(entryDependency)!
      for (const connection of getModuleReferencesInOrder(
        ssrEntryModule,
        compilation.moduleGraph
      )) {
        const depModule = connection.dependency
        const request = (depModule as unknown as webpack.NormalModule).request

        // It is possible that the same entry is added multiple times in the
        // connection graph. We can just skip these to speed up the process.
        if (visitedEntry.has(request)) continue
        visitedEntry.add(request)

        collectActions({
          entryRequest: request,
          resolvedModule: connection.resolvedModule,
        })
      }
    }

    return collectedActions
  }

  collectComponentInfoFromServerEntryDependency({
    entryRequest,
    compilation,
    resolvedModule,
  }: {
    entryRequest: string
    compilation: webpack.Compilation
    resolvedModule: any /* Dependency */
  }): {
    cssImports: CssImports
    clientComponentImports: ClientComponentImports
    actionImports: [string, ActionIdNamePair[]][]
  } {
    // Keep track of checked modules to avoid infinite loops with recursive imports.
    const visitedOfClientComponentsTraverse = new Set()

    // Info to collect.
    const clientComponentImports: ClientComponentImports = {}
    const actionImports: [string, ActionIdNamePair[]][] = []
    const CSSImports = new Set<string>()

    const filterClientComponents = (
      mod: webpack.NormalModule,
      importedIdentifiers: string[]
    ): void => {
      if (!mod) return

      const modResource = getModuleResource(mod)

      if (!modResource) return
      if (visitedOfClientComponentsTraverse.has(modResource)) {
        if (clientComponentImports[modResource]) {
          addClientImport(
            mod,
            modResource,
            clientComponentImports,
            importedIdentifiers,
            false
          )
        }
        return
      }
      visitedOfClientComponentsTraverse.add(modResource)

      const actionIds = getModuleBuildInfo(mod).rsc?.actionIds
      if (actionIds) {
        actionImports.push([
          modResource,
          Object.entries(actionIds).map(([id, exportedName]) => ({
            id,
            exportedName,
          })),
        ])
      }

      if (isCSSMod(mod)) {
        const sideEffectFree =
          mod.factoryMeta && (mod.factoryMeta as any).sideEffectFree

        if (sideEffectFree) {
          const unused = !compilation.moduleGraph
            .getExportsInfo(mod)
            .isModuleUsed(this.webpackRuntime)

          if (unused) return
        }

        CSSImports.add(modResource)
      } else if (isClientComponentEntryModule(mod)) {
        if (!clientComponentImports[modResource]) {
          clientComponentImports[modResource] = new Set()
        }
        addClientImport(
          mod,
          modResource,
          clientComponentImports,
          importedIdentifiers,
          true
        )

        return
      }

      getModuleReferencesInOrder(mod, compilation.moduleGraph).forEach(
        (connection: any) => {
          let dependencyIds: string[] = []

          // `ids` are the identifiers that are imported from the dependency,
          // if it's present, it's an array of strings.
          if (connection.dependency?.ids) {
            dependencyIds.push(...connection.dependency.ids)
          } else {
            dependencyIds = ['*']
          }

          filterClientComponents(connection.resolvedModule, dependencyIds)
        }
      )
    }

    // Traverse the module graph to find all client components.
    filterClientComponents(resolvedModule, [])

    return {
      clientComponentImports,
      cssImports: CSSImports.size
        ? {
            [entryRequest]: Array.from(CSSImports),
          }
        : {},
      actionImports,
    }
  }

  injectClientEntryAndSSRModules({
    compiler,
    compilation,
    entryName,
    clientImports,
    bundlePath,
    absolutePagePath,
  }: {
    compiler: webpack.Compiler
    compilation: webpack.Compilation
    entryName: string
    clientImports: ClientComponentImports
    bundlePath: string
    absolutePagePath?: string
  }): [
    shouldInvalidate: boolean,
    addSSREntryPromise: Promise<void>,
    addRSCEntryPromise: Promise<void>,
    ssrDep: ReturnType<typeof webpack.EntryPlugin.createDependency>,
  ] {
    let shouldInvalidate = false

    const modules = Object.keys(clientImports)
      .sort((a, b) => (regexCSS.test(b) ? 1 : a.localeCompare(b)))
      .map((clientImportPath) => ({
        request: clientImportPath,
        ids: [...clientImports[clientImportPath]],
      }))

    // For the client entry, we always use the CJS build of Next.js. If the
    // server is using the ESM build (when using the Edge runtime), we need to
    // replace them.
    const clientBrowserLoader = `next-flight-client-entry-loader?${stringify({
      modules: (this.isEdgeServer
        ? modules.map(({ request, ids }) => ({
            request: request.replace(
              /[\\/]next[\\/]dist[\\/]esm[\\/]/,
              '/next/dist/'.replace(/\//g, path.sep)
            ),
            ids,
          }))
        : modules
      ).map((x) => JSON.stringify(x)),
      server: false,
    })}!`

    const clientServerLoader = `next-flight-client-entry-loader?${stringify({
      modules: modules.map((x) => JSON.stringify(x)),
      server: true,
    })}!`

    // Add for the client compilation
    // Inject the entry to the client compiler.
    if (this.dev) {
      const entries = getEntries(compiler.outputPath)
      const pageKey = getEntryKey(
        COMPILER_NAMES.client,
        PAGE_TYPES.APP,
        bundlePath
      )

      if (!entries[pageKey]) {
        entries[pageKey] = {
          type: EntryTypes.CHILD_ENTRY,
          parentEntries: new Set([entryName]),
          absoluteEntryFilePath: absolutePagePath,
          bundlePath,
          request: clientBrowserLoader,
          dispose: false,
          lastActiveTime: Date.now(),
        }
        shouldInvalidate = true
      } else {
        const entryData = entries[pageKey]
        // New version of the client loader
        if (entryData.request !== clientBrowserLoader) {
          entryData.request = clientBrowserLoader
          shouldInvalidate = true
        }
        if (entryData.type === EntryTypes.CHILD_ENTRY) {
          entryData.parentEntries.add(entryName)
        }
        entryData.dispose = false
        entryData.lastActiveTime = Date.now()
      }
    } else {
      pluginState.injectedClientEntries[bundlePath] = clientBrowserLoader
    }

    const clientComponentSSREntryDep = webpack.EntryPlugin.createDependency(
      clientServerLoader,
      { name: bundlePath }
    )

    const clientComponentRSCEntryDep = webpack.EntryPlugin.createDependency(
      clientServerLoader,
      { name: bundlePath }
    )

    return [
      shouldInvalidate,
      // Add the entries to the server compiler for the SSR and RSC layers. The
      // promises are awaited later using `Promise.all` in order to parallelize
      // adding the entries.
      this.addEntry(compilation, compiler.context, clientComponentSSREntryDep, {
        name: entryName,
        layer: WEBPACK_LAYERS.serverSideRendering,
      }),
      this.addEntry(compilation, compiler.context, clientComponentRSCEntryDep, {
        name: entryName,
        layer: WEBPACK_LAYERS.reactServerComponents,
      }),
      clientComponentSSREntryDep,
    ]
  }

  injectActionEntry({
    compiler,
    compilation,
    actions,
    entryName,
    bundlePath,
    fromClient,
    createdActionIds,
  }: {
    compiler: webpack.Compiler
    compilation: webpack.Compilation
    actions: Map<string, ActionIdNamePair[]>
    entryName: string
    bundlePath: string
    createdActionIds: Set<string>
    fromClient?: boolean
  }) {
    const actionsArray = Array.from(actions.entries())
    for (const [, actionsFromModule] of actions) {
      for (const { id } of actionsFromModule) {
        createdActionIds.add(entryName + '@' + id)
      }
    }

    if (actionsArray.length === 0) {
      return Promise.resolve()
    }

    const actionLoader = `next-flight-action-entry-loader?${stringify({
      actions: JSON.stringify(
        actionsArray satisfies FlightActionEntryLoaderActions
      ),
      __client_imported__: fromClient,
    })}!`

    const currentCompilerServerActions = this.isEdgeServer
      ? pluginState.edgeServerActions
      : pluginState.serverActions

    for (const [, actionsFromModule] of actionsArray) {
      for (const { id } of actionsFromModule) {
        if (typeof currentCompilerServerActions[id] === 'undefined') {
          currentCompilerServerActions[id] = {
            workers: {},
            layer: {},
          }
        }
        currentCompilerServerActions[id].workers[bundlePath] = {
          moduleId: '', // TODO: What's the meaning of this?
          async: false,
        }

        currentCompilerServerActions[id].layer[bundlePath] = fromClient
          ? WEBPACK_LAYERS.actionBrowser
          : WEBPACK_LAYERS.reactServerComponents
      }
    }

    // Inject the entry to the server compiler
    const actionEntryDep = webpack.EntryPlugin.createDependency(actionLoader, {
      name: bundlePath,
    })

    return this.addEntry(
      compilation,
      // Reuse compilation context.
      compiler.context,
      actionEntryDep,
      {
        name: entryName,
        layer: fromClient
          ? WEBPACK_LAYERS.actionBrowser
          : WEBPACK_LAYERS.reactServerComponents,
      }
    )
  }

  addEntry(
    compilation: any,
    context: string,
    dependency: webpack.Dependency,
    options: webpack.EntryOptions
  ): Promise<any> /* Promise<module> */ {
    return new Promise((resolve, reject) => {
      const entry = compilation.entries.get(options.name)
      entry.includeDependencies.push(dependency)
      compilation.hooks.addEntry.call(entry, options)
      compilation.addModuleTree(
        {
          context,
          dependency,
          contextInfo: { issuerLayer: options.layer },
        },
        (err: Error | undefined, module: any) => {
          if (err) {
            compilation.hooks.failedEntry.call(dependency, options, err)
            return reject(err)
          }

          compilation.hooks.succeedEntry.call(dependency, options, module)

          compilation.moduleGraph
            .getExportsInfo(module)
            .setUsedInUnknownWay(
              this.isEdgeServer ? EDGE_RUNTIME_WEBPACK : DEFAULT_RUNTIME_WEBPACK
            )

          return resolve(module)
        }
      )
    })
  }

  async createActionAssets(compilation: webpack.Compilation) {
    const serverActions: ActionManifest['node'] = {}
    const edgeServerActions: ActionManifest['edge'] = {}

    traverseModules(compilation, (mod, _chunk, chunkGroup, modId) => {
      // Go through all action entries and record the module ID for each entry.
      if (
        chunkGroup.name &&
        mod.request &&
        modId &&
        /next-flight-action-entry-loader/.test(mod.request)
      ) {
        const fromClient = /&__client_imported__=true/.test(mod.request)

        const mapping = this.isEdgeServer
          ? pluginState.edgeServerActionModules
          : pluginState.serverActionModules

        if (!mapping[chunkGroup.name]) {
          mapping[chunkGroup.name] = {}
        }
        mapping[chunkGroup.name][fromClient ? 'client' : 'server'] = {
          moduleId: modId,
          async: compilation.moduleGraph.isAsync(mod),
        }
      }
    })

    for (let id in pluginState.serverActions) {
      const action = pluginState.serverActions[id]
      for (let name in action.workers) {
        const modId =
          pluginState.serverActionModules[name][
            action.layer[name] === WEBPACK_LAYERS.actionBrowser
              ? 'client'
              : 'server'
          ]
        action.workers[name] = modId!
      }
      serverActions[id] = action
    }

    for (let id in pluginState.edgeServerActions) {
      const action = pluginState.edgeServerActions[id]
      for (let name in action.workers) {
        const modId =
          pluginState.edgeServerActionModules[name][
            action.layer[name] === WEBPACK_LAYERS.actionBrowser
              ? 'client'
              : 'server'
          ]
        action.workers[name] = modId!
      }
      edgeServerActions[id] = action
    }

    const serverManifest = {
      node: serverActions,
      edge: edgeServerActions,
      encryptionKey: this.encryptionKey,
    }
    const edgeServerManifest = {
      ...serverManifest,
      encryptionKey: 'process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
    }

    const json = JSON.stringify(serverManifest, null, this.dev ? 2 : undefined)
    const edgeJson = JSON.stringify(
      edgeServerManifest,
      null,
      this.dev ? 2 : undefined
    )

    compilation.emitAsset(
      `${this.assetPrefix}${SERVER_REFERENCE_MANIFEST}.js`,
      new sources.RawSource(
        `self.__RSC_SERVER_MANIFEST=${JSON.stringify(edgeJson)}`
      ) as unknown as webpack.sources.RawSource
    )
    compilation.emitAsset(
      `${this.assetPrefix}${SERVER_REFERENCE_MANIFEST}.json`,
      new sources.RawSource(json) as unknown as webpack.sources.RawSource
    )
  }
}

function addClientImport(
  mod: webpack.NormalModule,
  modRequest: string,
  clientComponentImports: ClientComponentImports,
  importedIdentifiers: string[],
  isFirstVisitModule: boolean
) {
  const clientEntryType = getModuleBuildInfo(mod).rsc?.clientEntryType
  const isCjsModule = clientEntryType === 'cjs'
  const assumedSourceType = getAssumedSourceType(
    mod,
    isCjsModule ? 'commonjs' : 'auto'
  )

  const clientImportsSet = clientComponentImports[modRequest]

  if (importedIdentifiers[0] === '*') {
    // If there's collected import path with named import identifiers,
    // or there's nothing in collected imports are empty.
    // we should include the whole module.
    if (!isFirstVisitModule && [...clientImportsSet][0] !== '*') {
      clientComponentImports[modRequest] = new Set(['*'])
    }
  } else {
    const isAutoModuleSourceType = assumedSourceType === 'auto'
    if (isAutoModuleSourceType) {
      clientComponentImports[modRequest] = new Set(['*'])
    } else {
      // If it's not analyzed as named ESM exports, e.g. if it's mixing `export *` with named exports,
      // We'll include all modules since it's not able to do tree-shaking.
      for (const name of importedIdentifiers) {
        // For cjs module default import, we include the whole module since
        const isCjsDefaultImport = isCjsModule && name === 'default'

        // Always include __esModule along with cjs module default export,
        // to make sure it work with client module proxy from React.
        if (isCjsDefaultImport) {
          clientComponentImports[modRequest].add('__esModule')
        }

        clientComponentImports[modRequest].add(name)
      }
    }
  }
}

function getModuleResource(mod: webpack.NormalModule): string {
  const modPath: string = mod.resourceResolveData?.path || ''
  const modQuery = mod.resourceResolveData?.query || ''
  // We have to always use the resolved request here to make sure the
  // server and client are using the same module path (required by RSC), as
  // the server compiler and client compiler have different resolve configs.
  let modResource: string = modPath + modQuery

  // Context modules don't have a resource path, we use the identifier instead.
  if (mod.constructor.name === 'ContextModule') {
    modResource = mod.identifier()
  }

  // For the barrel optimization, we need to use the match resource instead
  // because there will be 2 modules for the same file (same resource path)
  // but they're different modules and can't be deduped via `visitedModule`.
  // The first module is a virtual re-export module created by the loader.
  if (mod.matchResource?.startsWith(BARREL_OPTIMIZATION_PREFIX)) {
    modResource = mod.matchResource + ':' + modResource
  }

  if (mod.resource === `?${WEBPACK_RESOURCE_QUERIES.metadataRoute}`) {
    return getMetadataRouteResource(mod.rawRequest).filePath
  }

  return modResource
}

function getMetadataRouteResource(request: string): MetadataRouteLoaderOptions {
  // e.g. next-metadata-route-loader?filePath=<some-url-encoded-path>&isDynamicRouteExtension=1!?__next_metadata_route__
  const query = request.split('!')[0].split('next-metadata-route-loader?')[1]

  return parse(query) as MetadataRouteLoaderOptions
}

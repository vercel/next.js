import type {
  CssImports,
  ClientComponentImports,
  FlightClientEntryModuleItem,
} from '../loaders/next-flight-client-entry-loader'

import { webpack } from 'next/dist/compiled/webpack/webpack'
import { stringify } from 'querystring'
import path from 'path'
import { sources } from 'next/dist/compiled/webpack/webpack'
import {
  getInvalidator,
  getEntries,
  EntryTypes,
  getEntryKey,
} from '../../../server/dev/on-demand-entry-handler'
import { WEBPACK_LAYERS } from '../../../lib/constants'
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
  getActions,
  generateActionId,
  isClientComponentEntryModule,
  isCSSMod,
  regexCSS,
} from '../loaders/utils'
import {
  traverseModules,
  forEachEntryModule,
  formatBarrelOptimizedResource,
} from '../utils'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'
import { getProxiedPluginState } from '../../build-context'
import { generateRandomActionKeyRaw } from '../../../server/app-render/action-encryption-utils'
import { PAGE_TYPES } from '../../../lib/page-types'

interface Options {
  dev: boolean
  appDir: string
  isEdgeServer: boolean
}

const PLUGIN_NAME = 'FlightClientEntryPlugin'

type Actions = {
  [actionId: string]: {
    workers: {
      [name: string]: string | number
    }
    // Record which layer the action is in (rsc or sc_action), in the specific entry.
    layer: {
      [name: string]: string
    }
  }
}

export type ActionManifest = {
  // Assign a unique encryption key during production build.
  encryptionKey: string
  node: Actions
  edge: Actions
}

const pluginState = getProxiedPluginState({
  // A map to track "action" -> "list of bundles".
  serverActions: {} as ActionManifest['node'],
  edgeServerActions: {} as ActionManifest['edge'],

  actionModServerId: {} as Record<
    string,
    {
      server?: string | number
      client?: string | number
    }
  >,
  actionModEdgeServerId: {} as Record<
    string,
    {
      server?: string | number
      client?: string | number
    }
  >,

  // Mapping of resource path to module id for server/edge server.
  serverModuleIds: {} as Record<string, string | number>,
  edgeServerModuleIds: {} as Record<string, string | number>,

  // Collect modules from server/edge compiler in client layer,
  // and detect if it's been used, and mark it as `async: true` for react.
  // So that react could unwrap the async module from promise and render module itself.
  ASYNC_CLIENT_MODULES: [] as string[],

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
  isEdgeServer: boolean
  assetPrefix: string

  constructor(options: Options) {
    this.dev = options.dev
    this.appDir = options.appDir
    this.isEdgeServer = options.isEdgeServer
    this.assetPrefix = !this.dev && !this.isEdgeServer ? '../' : ''
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation, { normalModuleFactory }) => {
        compilation.dependencyFactories.set(
          webpack.dependencies.ModuleDependency,
          normalModuleFactory
        )
        compilation.dependencyTemplates.set(
          webpack.dependencies.ModuleDependency,
          new webpack.dependencies.NullDependency.Template()
        )
      }
    )

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

          if (this.isEdgeServer) {
            pluginState.edgeServerModuleIds[
              ssrNamedModuleId.replace(/\/next\/dist\/esm\//, '/next/dist/')
            ] = modId
          } else {
            pluginState.serverModuleIds[ssrNamedModuleId] = modId
          }
        }
      }

      traverseModules(compilation, (mod, _chunk, _chunkGroup, modId) => {
        // The module must has request, and resource so it's not a new entry created with loader.
        // Using the client layer module, which doesn't have `rsc` tag in buildInfo.
        if (mod.request && mod.resource && !mod.buildInfo.rsc) {
          if (compilation.moduleGraph.isAsync(mod)) {
            pluginState.ASYNC_CLIENT_MODULES.push(mod.resource)
          }
        }

        recordModule(String(modId), mod)
      })
    })

    compiler.hooks.make.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tapPromise(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
        },
        (assets) => this.createActionAssets(compilation, assets)
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
      ReturnType<typeof this.injectClientEntryAndSSRModules>[2][]
    > = {}

    const addActionEntryList: Array<ReturnType<typeof this.injectActionEntry>> =
      []
    const actionMapsPerEntry: Record<string, Map<string, string[]>> = {}
    const createdActions = new Set<string>()

    // For each SC server compilation entry, we need to create its corresponding
    // client component entry.
    forEachEntryModule(compilation, ({ name, entryModule }) => {
      const internalClientComponentEntryImports: ClientComponentImports = {}
      const actionEntryImports = new Map<string, string[]>()
      const clientEntriesToInject = []
      const mergedCSSimports: CssImports = {}

      for (const connection of compilation.moduleGraph.getOutgoingConnections(
        entryModule
      )) {
        // Entry can be any user defined entry files such as layout, page, error, loading, etc.
        const entryRequest = (
          connection.dependency as unknown as webpack.NormalModule
        ).request

        const { clientComponentImports, actionImports, cssImports } =
          this.collectComponentInfoFromServerEntryDependency({
            entryRequest,
            compilation,
            resolvedModule: connection.resolvedModule,
          })

        actionImports.forEach(([dep, names]) =>
          actionEntryImports.set(dep, names)
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
        const bundlePath = normalizePathSep(
          relativeRequest.replace(/\.[^.\\/]+$/, '').replace(/^src[\\/]/, '')
        )

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
            ).reduce((res, curr) => {
              res[curr] = new Set()
              return res
            }, {} as ClientComponentImports),
          },
        })

        // Track all created SSR dependencies for each entry from the server layer.
        if (!createdSSRDependenciesForEntry[clientEntryToInject.entryName]) {
          createdSSRDependenciesForEntry[clientEntryToInject.entryName] = []
        }
        createdSSRDependenciesForEntry[clientEntryToInject.entryName].push(
          injected[2]
        )

        addClientEntryAndSSRModulesList.push(injected)
      }

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
      for (const [dep, actionNames] of actionEntryImports) {
        for (const actionName of actionNames) {
          createdActions.add(name + '@' + dep + '@' + actionName)
        }
      }
      addActionEntryList.push(
        this.injectActionEntry({
          compiler,
          compilation,
          actions: actionEntryImports,
          entryName: name,
          bundlePath: name,
        })
      )
    }

    compilation.hooks.finishModules.tapPromise(PLUGIN_NAME, async () => {
      const addedClientActionEntryList: Promise<any>[] = []
      const actionMapsPerClientEntry: Record<string, Map<string, string[]>> = {}

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

      for (const [name, actionEntryImports] of Object.entries(
        actionMapsPerClientEntry
      )) {
        // If an action method is already created in the server layer, we don't
        // need to create it again in the action layer.
        // This is to avoid duplicate action instances and make sure the module
        // state is shared.
        let remainingClientImportedActions = false
        const remainingActionEntryImports = new Map<string, string[]>()
        for (const [dep, actionNames] of actionEntryImports) {
          const remainingActionNames = []
          for (const actionName of actionNames) {
            const id = name + '@' + dep + '@' + actionName
            if (!createdActions.has(id)) {
              remainingActionNames.push(actionName)
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
              entryName: name,
              bundlePath: name,
              fromClient: true,
            })
          )
        }
      }

      await Promise.all(addedClientActionEntryList)
      return
    })

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

    // Client compiler is invalidated before awaiting the compilation of the SSR client component entries
    // so that the client compiler is running in parallel to the server compiler.
    await Promise.all(
      addClientEntryAndSSRModulesList.map(
        (addClientEntryAndSSRModules) => addClientEntryAndSSRModules[1]
      )
    )

    // Wait for action entries to be added.
    await Promise.all(addActionEntryList)
  }

  collectClientActionsFromDependencies({
    compilation,
    dependencies,
  }: {
    compilation: webpack.Compilation
    dependencies: ReturnType<typeof webpack.EntryPlugin.createDependency>[]
  }) {
    // action file path -> action names
    const collectedActions = new Map<string, string[]>()

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

        // We have to always use the resolved request here to make sure the
        // server and client are using the same module path (required by RSC), as
        // the server compiler and client compiler have different resolve configs.
        let modRequest: string | undefined =
          mod.resourceResolveData?.path + mod.resourceResolveData?.query

        // For the barrel optimization, we need to use the match resource instead
        // because there will be 2 modules for the same file (same resource path)
        // but they're different modules and can't be deduped via `visitedModule`.
        // The first module is a virtual re-export module created by the loader.
        if (mod.matchResource?.startsWith(BARREL_OPTIMIZATION_PREFIX)) {
          modRequest = mod.matchResource + ':' + modRequest
        }

        if (!modRequest || visitedModule.has(modRequest)) return
        visitedModule.add(modRequest)

        const actions = getActions(mod)
        if (actions) {
          collectedActions.set(modRequest, actions)
        }

        ;[...compilation.moduleGraph.getOutgoingConnections(mod)].forEach(
          (connection) => {
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
      for (const connection of compilation.moduleGraph.getOutgoingConnections(
        ssrEntryModule
      )) {
        const dependency = connection.dependency!
        const request = (dependency as unknown as webpack.NormalModule).request

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
    actionImports: [string, string[]][]
  } {
    // Keep track of checked modules to avoid infinite loops with recursive imports.
    const visited = new Set()

    // Info to collect.
    const clientComponentImports: ClientComponentImports = {}
    const actionImports: [string, string[]][] = []
    const CSSImports = new Set<string>()

    const filterClientComponents = (
      mod: webpack.NormalModule,
      importedIdentifiers: string[]
    ): void => {
      if (!mod) return

      const isCSS = isCSSMod(mod)

      // We have to always use the resolved request here to make sure the
      // server and client are using the same module path (required by RSC), as
      // the server compiler and client compiler have different resolve configs.
      let modRequest: string | undefined =
        mod.resourceResolveData?.path + mod.resourceResolveData?.query

      // Context modules don't have a resource path, we use the identifier instead.
      if (mod.constructor.name === 'ContextModule') {
        modRequest = (mod as any)._identifier
      }

      // For the barrel optimization, we need to use the match resource instead
      // because there will be 2 modules for the same file (same resource path)
      // but they're different modules and can't be deduped via `visitedModule`.
      // The first module is a virtual re-export module created by the loader.
      if (mod.matchResource?.startsWith(BARREL_OPTIMIZATION_PREFIX)) {
        modRequest = mod.matchResource + ':' + modRequest
      }

      if (!modRequest) return
      if (visited.has(modRequest)) {
        if (clientComponentImports[modRequest]) {
          for (const name of importedIdentifiers) {
            clientComponentImports[modRequest].add(name)
          }
        }
        return
      }
      visited.add(modRequest)

      const actions = getActions(mod)
      if (actions) {
        actionImports.push([modRequest, actions])
      }

      const webpackRuntime = this.isEdgeServer
        ? EDGE_RUNTIME_WEBPACK
        : DEFAULT_RUNTIME_WEBPACK

      if (isCSS) {
        const sideEffectFree =
          mod.factoryMeta && (mod.factoryMeta as any).sideEffectFree

        if (sideEffectFree) {
          const unused = !compilation.moduleGraph
            .getExportsInfo(mod)
            .isModuleUsed(webpackRuntime)

          if (unused) return
        }

        CSSImports.add(modRequest)
      } else if (isClientComponentEntryModule(mod)) {
        if (!clientComponentImports[modRequest]) {
          clientComponentImports[modRequest] = new Set()
        }
        for (const name of importedIdentifiers) {
          clientComponentImports[modRequest].add(name)
        }
        return
      }

      Array.from(compilation.moduleGraph.getOutgoingConnections(mod)).forEach(
        (connection: any) => {
          const dependencyIds: string[] = []
          if (connection.dependency?.ids?.length) {
            dependencyIds.push(...connection.dependency.ids)
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
    addEntryPromise: Promise<void>,
    ssrDep: ReturnType<typeof webpack.EntryPlugin.createDependency>
  ] {
    let shouldInvalidate = false

    const loaderOptions: {
      modules: FlightClientEntryModuleItem[]
      server: boolean
    } = {
      modules: Object.keys(clientImports)
        .sort((a, b) => (regexCSS.test(b) ? 1 : a.localeCompare(b)))
        .map((clientImportPath) => ({
          request: clientImportPath,
          ids: [...clientImports[clientImportPath]],
        })),
      server: false,
    }

    // For the client entry, we always use the CJS build of Next.js. If the
    // server is using the ESM build (when using the Edge runtime), we need to
    // replace them.
    const clientBrowserLoader = `next-flight-client-entry-loader?${stringify({
      modules: (this.isEdgeServer
        ? loaderOptions.modules.map(({ request, ids }) => ({
            request: request.replace(
              /[\\/]next[\\/]dist[\\/]esm[\\/]/,
              '/next/dist/'.replace(/\//g, path.sep)
            ),
            ids,
          }))
        : loaderOptions.modules
      ).map((x) => JSON.stringify(x)),
      server: false,
    })}!`

    const clientSSRLoader = `next-flight-client-entry-loader?${stringify({
      modules: loaderOptions.modules.map((x) => JSON.stringify(x)),
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

    // Inject the entry to the server compiler (__ssr__).
    const clientComponentEntryDep = webpack.EntryPlugin.createDependency(
      clientSSRLoader,
      {
        name: bundlePath,
      }
    )

    return [
      shouldInvalidate,
      // Add the dependency to the server compiler.
      // This promise is awaited later using `Promise.all` in order to parallelize adding the entries.
      // It ensures we can parallelize the SSR and Client compiler entries.
      this.addEntry(
        compilation,
        // Reuse compilation context.
        compiler.context,
        clientComponentEntryDep,
        {
          // By using the same entry name
          name: entryName,
          // Layer should be client for the SSR modules
          // This ensures the client components are bundled on client layer
          layer: WEBPACK_LAYERS.serverSideRendering,
        }
      ),
      clientComponentEntryDep,
    ]
  }

  injectActionEntry({
    compiler,
    compilation,
    actions,
    entryName,
    bundlePath,
    fromClient,
  }: {
    compiler: webpack.Compiler
    compilation: webpack.Compilation
    actions: Map<string, string[]>
    entryName: string
    bundlePath: string
    fromClient?: boolean
  }) {
    const actionsArray = Array.from(actions.entries())

    const actionLoader = `next-flight-action-entry-loader?${stringify({
      actions: JSON.stringify(actionsArray),
      __client_imported__: fromClient,
    })}!`

    const currentCompilerServerActions = this.isEdgeServer
      ? pluginState.edgeServerActions
      : pluginState.serverActions
    for (const [p, names] of actionsArray) {
      for (const name of names) {
        const id = generateActionId(p, name)
        if (typeof currentCompilerServerActions[id] === 'undefined') {
          currentCompilerServerActions[id] = {
            workers: {},
            layer: {},
          }
        }
        currentCompilerServerActions[id].workers[bundlePath] = ''
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
          return resolve(module)
        }
      )
    })
  }

  async createActionAssets(
    compilation: webpack.Compilation,
    assets: webpack.Compilation['assets']
  ) {
    const serverActions: ActionManifest['node'] = {}
    const edgeServerActions: ActionManifest['edge'] = {}

    traverseModules(compilation, (mod, _chunk, chunkGroup, modId) => {
      // Go through all action entries and record the module ID for each entry.
      if (
        chunkGroup.name &&
        mod.request &&
        /next-flight-action-entry-loader/.test(mod.request)
      ) {
        const fromClient = /&__client_imported__=true/.test(mod.request)

        const mapping = this.isEdgeServer
          ? pluginState.actionModEdgeServerId
          : pluginState.actionModServerId

        if (!mapping[chunkGroup.name]) {
          mapping[chunkGroup.name] = {}
        }
        mapping[chunkGroup.name][fromClient ? 'client' : 'server'] = modId
      }
    })

    for (let id in pluginState.serverActions) {
      const action = pluginState.serverActions[id]
      for (let name in action.workers) {
        const modId =
          pluginState.actionModServerId[name][
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
          pluginState.actionModEdgeServerId[name][
            action.layer[name] === WEBPACK_LAYERS.actionBrowser
              ? 'client'
              : 'server'
          ]
        action.workers[name] = modId!
      }
      edgeServerActions[id] = action
    }

    const json = JSON.stringify(
      {
        node: serverActions,
        edge: edgeServerActions,

        // Assign encryption
        encryptionKey: await generateRandomActionKeyRaw(this.dev),
      },
      null,
      this.dev ? 2 : undefined
    )

    assets[`${this.assetPrefix}${SERVER_REFERENCE_MANIFEST}.js`] =
      new sources.RawSource(
        `self.__RSC_SERVER_MANIFEST=${JSON.stringify(json)}`
      ) as unknown as webpack.sources.RawSource
    assets[`${this.assetPrefix}${SERVER_REFERENCE_MANIFEST}.json`] =
      new sources.RawSource(json) as unknown as webpack.sources.RawSource
  }
}

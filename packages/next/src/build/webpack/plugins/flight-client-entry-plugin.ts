import type {
  CssImports,
  ClientComponentImports,
  NextFlightClientEntryLoaderOptions,
} from '../loaders/next-flight-client-entry-loader'
import type { ClientCSSReferenceManifest } from './flight-manifest-plugin'

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
  COMPILER_NAMES,
  EDGE_RUNTIME_WEBPACK,
  SERVER_REFERENCE_MANIFEST,
  FLIGHT_SERVER_CSS_MANIFEST,
} from '../../../shared/lib/constants'
import {
  generateActionId,
  getActions,
  isClientComponentEntryModule,
  isCSSMod,
} from '../loaders/utils'
import { traverseModules, forEachEntryModule } from '../utils'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'
import { getProxiedPluginState } from '../../build-context'

interface Options {
  dev: boolean
  appDir: string
  isEdgeServer: boolean
  useServerActions: boolean
}

const PLUGIN_NAME = 'ClientEntryPlugin'

export type ActionManifest = {
  [key in 'node' | 'edge']: {
    [actionId: string]: {
      workers: {
        [name: string]: string | number
      }
      // Record which layer the action is in (sc_server or sc_action), in the specific entry.
      layer: {
        [name: string]: string
      }
    }
  }
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

  // Manifest of CSS entry files for server/edge server.
  serverCSSManifest: {} as ClientCSSReferenceManifest,
  edgeServerCSSManifest: {} as ClientCSSReferenceManifest,

  // Mapping of resource path to module id for server/edge server.
  serverModuleIds: {} as Record<string, string | number>,
  edgeServerModuleIds: {} as Record<string, string | number>,

  // Collect modules from server/edge compiler in client layer,
  // and detect if it's been used, and mark it as `async: true` for react.
  // So that react could unwrap the async module from promise and render module itself.
  ASYNC_CLIENT_MODULES: [] as string[],

  injectedClientEntries: {} as Record<string, string>,
})

export class ClientReferenceEntryPlugin {
  dev: boolean
  appDir: string
  isEdgeServer: boolean
  useServerActions: boolean
  assetPrefix: string

  constructor(options: Options) {
    this.dev = options.dev
    this.appDir = options.appDir
    this.isEdgeServer = options.isEdgeServer
    this.useServerActions = options.useServerActions
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
        const modResource = mod.resourceResolveData?.path || mod.resource

        if (mod.layer !== WEBPACK_LAYERS.client) {
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
      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
        },
        (assets) => this.createActionAssets(compilation, assets)
      )
    })
  }

  async createClientEntries(compiler: webpack.Compiler, compilation: any) {
    const addClientEntryAndSSRModulesList: Array<
      ReturnType<typeof this.injectClientEntryAndSSRModules>
    > = []

    const addActionEntryList: Array<ReturnType<typeof this.injectActionEntry>> =
      []
    const actionMapsPerEntry: Record<string, Map<string, string[]>> = {}

    // For each SC server compilation entry, we need to create its corresponding
    // client component entry.
    forEachEntryModule(compilation, ({ name, entryModule }) => {
      const internalClientComponentEntryImports = new Set<
        ClientComponentImports[0]
      >()
      const actionEntryImports = new Map<string, string[]>()

      for (const connection of compilation.moduleGraph.getOutgoingConnections(
        entryModule
      )) {
        // Entry can be any user defined entry files such as layout, page, error, loading, etc.
        const entryDependency = connection.dependency
        const entryRequest = connection.dependency.request

        const { clientImports, actionImports } =
          this.collectComponentInfoFromDependencies({
            entryRequest,
            compilation,
            dependency: entryDependency,
          })

        actionImports.forEach(([dep, names]) =>
          actionEntryImports.set(dep, names)
        )

        const isAbsoluteRequest = path.isAbsolute(entryRequest)

        // Next.js internals are put into a separate entry.
        if (!isAbsoluteRequest) {
          clientImports.forEach((value) =>
            internalClientComponentEntryImports.add(value)
          )
          continue
        }

        const relativeRequest = isAbsoluteRequest
          ? path.relative(compilation.options.context, entryRequest)
          : entryRequest

        // Replace file suffix as `.js` will be added.
        const bundlePath = normalizePathSep(
          relativeRequest.replace(/\.[^.\\/]+$/, '').replace(/^src[\\/]/, '')
        )

        addClientEntryAndSSRModulesList.push(
          this.injectClientEntryAndSSRModules({
            compiler,
            compilation,
            entryName: name,
            clientImports,
            bundlePath,
            absolutePagePath: entryRequest,
          })
        )
      }

      // Create internal app
      addClientEntryAndSSRModulesList.push(
        this.injectClientEntryAndSSRModules({
          compiler,
          compilation,
          entryName: name,
          clientImports: [...internalClientComponentEntryImports],
          bundlePath: APP_CLIENT_INTERNALS,
        })
      )

      if (actionEntryImports.size > 0) {
        if (!this.useServerActions) {
          compilation.errors.push(
            new Error(
              'Server Actions require `experimental.serverActions` option to be enabled in your Next.js config: https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions'
            )
          )
        } else {
          if (!actionMapsPerEntry[name]) {
            actionMapsPerEntry[name] = new Map()
          }
          actionMapsPerEntry[name] = new Map([
            ...actionMapsPerEntry[name],
            ...actionEntryImports,
          ])
        }
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
        })
      )
    }

    // To collect all CSS imports and action imports for a specific entry
    // including the ones that are in the client graph, we need to store a
    // map for client boundary dependencies.
    function collectClientEntryDependencyMap(name: string) {
      const clientEntryDependencyMap: Record<string, any> = {}

      const entry = compilation.entries.get(name)
      entry.includeDependencies.forEach((dep: any) => {
        if (
          dep.request &&
          dep.request.startsWith('next-flight-client-entry-loader?')
        ) {
          const mod: webpack.NormalModule =
            compilation.moduleGraph.getResolvedModule(dep)

          compilation.moduleGraph
            .getOutgoingConnections(mod)
            .forEach((connection: any) => {
              if (connection.dependency) {
                clientEntryDependencyMap[connection.dependency.request] =
                  connection.dependency
              }
            })
        }
      })

      return clientEntryDependencyMap
    }

    // We need to create extra action entries that are created in the
    // client layer.
    compilation.hooks.finishModules.tapPromise(PLUGIN_NAME, () => {
      const addedClientActionEntryList: Promise<any>[] = []
      const actionMapsPerClientEntry: Record<string, Map<string, string[]>> = {}

      forEachEntryModule(compilation, ({ name, entryModule }) => {
        const actionEntryImports = new Map<string, string[]>()
        const clientEntryDependencyMap = collectClientEntryDependencyMap(name)

        const tracked = new Set<string>()
        for (const connection of compilation.moduleGraph.getOutgoingConnections(
          entryModule
        )) {
          const entryDependency = connection.dependency
          const entryRequest = connection.dependency.request

          // It is possible that the same entry is added multiple times in the
          // connection graph. We can just skip these to speed up the process.
          if (tracked.has(entryRequest)) continue
          tracked.add(entryRequest)

          const { clientActionImports } =
            this.collectComponentInfoFromDependencies({
              entryRequest,
              compilation,
              dependency: entryDependency,
              clientEntryDependencyMap,
            })

          clientActionImports.forEach(([dep, names]) =>
            actionEntryImports.set(dep, names)
          )
        }

        if (actionEntryImports.size > 0) {
          if (!actionMapsPerClientEntry[name]) {
            actionMapsPerClientEntry[name] = new Map()
          }
          actionMapsPerClientEntry[name] = new Map([
            ...actionMapsPerClientEntry[name],
            ...actionEntryImports,
          ])
        }
      })

      for (const [name, actionEntryImports] of Object.entries(
        actionMapsPerClientEntry
      )) {
        addedClientActionEntryList.push(
          this.injectActionEntry({
            compiler,
            compilation,
            actions: actionEntryImports,
            entryName: name,
            bundlePath: name,
            fromClient: true,
          })
        )
      }

      return Promise.all(addedClientActionEntryList)
    })

    // After optimizing all the modules, we collect the CSS that are still used
    // by the certain chunk.
    compilation.hooks.afterOptimizeModules.tap(PLUGIN_NAME, () => {
      const cssImportsForChunk: Record<string, Set<string>> = {}

      const cssManifest = this.isEdgeServer
        ? pluginState.edgeServerCSSManifest
        : pluginState.serverCSSManifest

      function collectModule(entryName: string, mod: any) {
        const resource = mod.resource
        const modId = resource
        if (modId) {
          if (isCSSMod(mod)) {
            cssImportsForChunk[entryName].add(modId)
          }
        }
      }

      compilation.chunkGroups.forEach((chunkGroup: any) => {
        chunkGroup.chunks.forEach((chunk: webpack.Chunk) => {
          // Here we only track page chunks.
          if (!chunk.name) return
          if (!chunk.name.endsWith('/page')) return

          const entryName = path.join(this.appDir, '..', chunk.name)

          if (!cssImportsForChunk[entryName]) {
            cssImportsForChunk[entryName] = new Set()
          }

          const chunkModules = compilation.chunkGraph.getChunkModulesIterable(
            chunk
          ) as Iterable<webpack.NormalModule>
          for (const mod of chunkModules) {
            collectModule(entryName, mod)

            const anyModule = mod as any
            if (anyModule.modules) {
              anyModule.modules.forEach((concatenatedMod: any) => {
                collectModule(entryName, concatenatedMod)
              })
            }
          }

          const entryCSSInfo: Record<string, string[]> =
            cssManifest.cssModules || {}
          entryCSSInfo[entryName] = [...cssImportsForChunk[entryName]]

          cssManifest.cssModules = entryCSSInfo
        })
      })

      forEachEntryModule(compilation, ({ name, entryModule }) => {
        const clientEntryDependencyMap = collectClientEntryDependencyMap(name)
        const tracked = new Set<string>()
        for (const connection of compilation.moduleGraph.getOutgoingConnections(
          entryModule
        )) {
          const entryDependency = connection.dependency
          const entryRequest = connection.dependency.request

          // It is possible that the same entry is added multiple times in the
          // connection graph. We can just skip these to speed up the process.
          if (tracked.has(entryRequest)) continue
          tracked.add(entryRequest)

          const { cssImports } = this.collectComponentInfoFromDependencies({
            entryRequest,
            compilation,
            dependency: entryDependency,
            clientEntryDependencyMap,
          })

          if (!cssManifest.cssImports) cssManifest.cssImports = {}
          Object.assign(cssManifest.cssImports, cssImports)
        }
      })
    })

    compilation.hooks.processAssets.tap(
      {
        name: PLUGIN_NAME,
        stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
      },
      (assets: webpack.Compilation['assets']) => {
        const data: ClientCSSReferenceManifest = {
          cssImports: {
            ...pluginState.serverCSSManifest.cssImports,
            ...pluginState.edgeServerCSSManifest.cssImports,
          },
          cssModules: {
            ...pluginState.serverCSSManifest.cssModules,
            ...pluginState.edgeServerCSSManifest.cssModules,
          },
        }
        const manifest = JSON.stringify(data, null, this.dev ? 2 : undefined)
        assets[`${this.assetPrefix}${FLIGHT_SERVER_CSS_MANIFEST}.json`] =
          new sources.RawSource(
            manifest
          ) as unknown as webpack.sources.RawSource
        assets[`${this.assetPrefix}${FLIGHT_SERVER_CSS_MANIFEST}.js`] =
          new sources.RawSource(
            'self.__RSC_CSS_MANIFEST=' + manifest
          ) as unknown as webpack.sources.RawSource
      }
    )

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

  collectComponentInfoFromDependencies({
    entryRequest,
    compilation,
    dependency,
    clientEntryDependencyMap,
  }: {
    entryRequest: string
    compilation: any
    dependency: any /* Dependency */
    clientEntryDependencyMap?: Record<string, any>
  }): {
    clientImports: ClientComponentImports
    cssImports: CssImports
    actionImports: [string, string[]][]
    clientActionImports: [string, string[]][]
  } {
    /**
     * Keep track of checked modules to avoid infinite loops with recursive imports.
     */
    const visitedBySegment: { [segment: string]: Set<string> } = {}
    const clientComponentImports: ClientComponentImports = []
    const actionImports: [string, string[]][] = []
    const clientActionImports: [string, string[]][] = []
    const CSSImports = new Set<string>()

    const filterClientComponents = (
      dependencyToFilter: any,
      inClientComponentBoundary: boolean
    ): void => {
      const mod: webpack.NormalModule =
        compilation.moduleGraph.getResolvedModule(dependencyToFilter)
      if (!mod) return

      const isCSS = isCSSMod(mod)

      // We have to always use the resolved request here to make sure the
      // server and client are using the same module path (required by RSC), as
      // the server compiler and client compiler have different resolve configs.
      const modRequest: string | undefined =
        mod.resourceResolveData?.path + mod.resourceResolveData?.query

      // Ensure module is not walked again if it's already been visited
      if (!visitedBySegment[entryRequest]) {
        visitedBySegment[entryRequest] = new Set()
      }
      const storeKey =
        (inClientComponentBoundary ? '0' : '1') + ':' + modRequest
      if (!modRequest || visitedBySegment[entryRequest].has(storeKey)) {
        return
      }
      visitedBySegment[entryRequest].add(storeKey)

      const isClientComponent = isClientComponentEntryModule(mod)

      const actions = getActions(mod)
      if (actions) {
        if (isClientComponent) {
          clientActionImports.push([modRequest, actions])
        } else {
          actionImports.push([modRequest, actions])
        }
      }

      if (isCSS) {
        const sideEffectFree =
          mod.factoryMeta && (mod.factoryMeta as any).sideEffectFree

        if (sideEffectFree) {
          const unused = !compilation.moduleGraph
            .getExportsInfo(mod)
            .isModuleUsed(
              this.isEdgeServer ? EDGE_RUNTIME_WEBPACK : 'webpack-runtime'
            )

          if (unused) {
            return
          }
        }

        CSSImports.add(modRequest)
      }

      // Check if request is for css file.
      if ((!inClientComponentBoundary && isClientComponent) || isCSS) {
        clientComponentImports.push(modRequest)

        // Here we are entering a client boundary, and we need to collect dependencies
        // in the client graph too.
        if (isClientComponent && clientEntryDependencyMap) {
          if (clientEntryDependencyMap[modRequest]) {
            filterClientComponents(clientEntryDependencyMap[modRequest], true)
          }
        }

        return
      }

      compilation.moduleGraph
        .getOutgoingConnections(mod)
        .forEach((connection: any) => {
          filterClientComponents(
            connection.dependency,
            inClientComponentBoundary || isClientComponent
          )
        })
    }

    // Don't traverse the module graph for the action loader.
    if (!/next-flight-action-entry-loader/.test(entryRequest)) {
      // Traverse the module graph to find all client components.
      filterClientComponents(dependency, false)
    }

    return {
      clientImports: clientComponentImports,
      cssImports: CSSImports.size
        ? {
            [entryRequest]: Array.from(CSSImports),
          }
        : {},
      actionImports,
      clientActionImports,
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
  }): [shouldInvalidate: boolean, addEntryPromise: Promise<void>] {
    let shouldInvalidate = false

    const loaderOptions: NextFlightClientEntryLoaderOptions = {
      modules: clientImports,
      server: false,
    }

    // For the client entry, we always use the CJS build of Next.js. If the
    // server is using the ESM build (when using the Edge runtime), we need to
    // replace them.
    const clientLoader = `next-flight-client-entry-loader?${stringify({
      modules: this.isEdgeServer
        ? clientImports.map((importPath) =>
            importPath.replace(
              /[\\/]next[\\/]dist[\\/]esm[\\/]/,
              '/next/dist/'.replace(/\//g, path.sep)
            )
          )
        : clientImports,
      server: false,
    })}!`

    const clientSSRLoader = `next-flight-client-entry-loader?${stringify({
      ...loaderOptions,
      server: true,
    })}!`

    // Add for the client compilation
    // Inject the entry to the client compiler.
    if (this.dev) {
      const entries = getEntries(compiler.outputPath)
      const pageKey = getEntryKey(COMPILER_NAMES.client, 'app', bundlePath)

      if (!entries[pageKey]) {
        entries[pageKey] = {
          type: EntryTypes.CHILD_ENTRY,
          parentEntries: new Set([entryName]),
          absoluteEntryFilePath: absolutePagePath,
          bundlePath,
          request: clientLoader,
          dispose: false,
          lastActiveTime: Date.now(),
        }
        shouldInvalidate = true
      } else {
        const entryData = entries[pageKey]
        // New version of the client loader
        if (entryData.request !== clientLoader) {
          entryData.request = clientLoader
          shouldInvalidate = true
        }
        if (entryData.type === EntryTypes.CHILD_ENTRY) {
          entryData.parentEntries.add(entryName)
        }
        entryData.dispose = false
        entryData.lastActiveTime = Date.now()
      }
    } else {
      pluginState.injectedClientEntries[bundlePath] = clientLoader
    }

    // Inject the entry to the server compiler (__sc_client__).
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
          layer: WEBPACK_LAYERS.client,
        }
      ),
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
          ? WEBPACK_LAYERS.action
          : WEBPACK_LAYERS.server
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
        layer: fromClient ? WEBPACK_LAYERS.action : WEBPACK_LAYERS.server,
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

  createActionAssets(
    compilation: webpack.Compilation,
    assets: webpack.Compilation['assets']
  ) {
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

    const serverActions: ActionManifest['node'] = {}
    for (let id in pluginState.serverActions) {
      const action = pluginState.serverActions[id]
      for (let name in action.workers) {
        const modId =
          pluginState.actionModServerId[name][
            action.layer[name] === WEBPACK_LAYERS.action ? 'client' : 'server'
          ]
        action.workers[name] = modId!
      }
      serverActions[id] = action
    }

    const edgeServerActions: ActionManifest['edge'] = {}
    for (let id in pluginState.edgeServerActions) {
      const action = pluginState.edgeServerActions[id]
      for (let name in action.workers) {
        const modId =
          pluginState.actionModEdgeServerId[name][
            action.layer[name] === WEBPACK_LAYERS.action ? 'client' : 'server'
          ]
        action.workers[name] = modId!
      }
      edgeServerActions[id] = action
    }

    const json = JSON.stringify(
      {
        node: serverActions,
        edge: edgeServerActions,
      },
      null,
      this.dev ? 2 : undefined
    )

    assets[`${this.assetPrefix}${SERVER_REFERENCE_MANIFEST}.js`] =
      new sources.RawSource(
        'self.__RSC_SERVER_MANIFEST=' + json
      ) as unknown as webpack.sources.RawSource
    assets[`${this.assetPrefix}${SERVER_REFERENCE_MANIFEST}.json`] =
      new sources.RawSource(json) as unknown as webpack.sources.RawSource
  }
}

import { stringify } from 'querystring'
import path from 'path'
import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import {
  getInvalidator,
  entries,
  EntryTypes,
} from '../../../server/dev/on-demand-entry-handler'
import type {
  CssImports,
  ClientComponentImports,
  NextFlightClientEntryLoaderOptions,
} from '../loaders/next-flight-client-entry-loader'
import { APP_DIR_ALIAS, WEBPACK_LAYERS } from '../../../lib/constants'
import {
  COMPILER_NAMES,
  EDGE_RUNTIME_WEBPACK,
  FLIGHT_SERVER_CSS_MANIFEST,
} from '../../../shared/lib/constants'
import { FlightCSSManifest } from './flight-manifest-plugin'
import { ASYNC_CLIENT_MODULES } from './flight-manifest-plugin'
import { isClientComponentModule, regexCSS } from '../loaders/utils'
import { traverseModules } from '../utils'

interface Options {
  dev: boolean
  isEdgeServer: boolean
}

const PLUGIN_NAME = 'ClientEntryPlugin'

export const injectedClientEntries = new Map()

export const serverModuleIds = new Map<string, string | number>()
export const edgeServerModuleIds = new Map<string, string | number>()

// TODO-APP: move CSS manifest generation to the flight manifest plugin.
const flightCSSManifest: FlightCSSManifest = {}

export class FlightClientEntryPlugin {
  dev: boolean
  isEdgeServer: boolean

  constructor(options: Options) {
    this.dev = options.dev
    this.isEdgeServer = options.isEdgeServer
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation, { normalModuleFactory }) => {
        compilation.dependencyFactories.set(
          (webpack as any).dependencies.ModuleDependency,
          normalModuleFactory
        )
        compilation.dependencyTemplates.set(
          (webpack as any).dependencies.ModuleDependency,
          new (webpack as any).dependencies.NullDependency.Template()
        )
      }
    )

    compiler.hooks.finishMake.tapPromise(PLUGIN_NAME, (compilation) => {
      return this.createClientEntries(compiler, compilation)
    })

    compiler.hooks.afterCompile.tap(PLUGIN_NAME, (compilation) => {
      traverseModules(compilation, (mod) => {
        // const modId = compilation.chunkGraph.getModuleId(mod) + ''
        // The module must has request, and resource so it's not a new entry created with loader.
        // Using the client layer module, which doesn't have `rsc` tag in buildInfo.
        if (mod.request && mod.resource && !mod.buildInfo.rsc) {
          if (compilation.moduleGraph.isAsync(mod)) {
            ASYNC_CLIENT_MODULES.add(mod.resource)
          }
        }
      })

      const recordModule = (modId: string, mod: any) => {
        const modResource = mod.resourceResolveData?.path || mod.resource

        if (
          mod.resourceResolveData?.context?.issuerLayer !==
          WEBPACK_LAYERS.client
        ) {
          return
        }

        if (typeof modId !== 'undefined' && modResource) {
          // Note that this isn't that reliable as webpack is still possible to assign
          // additional queries to make sure there's no conflict even using the `named`
          // module ID strategy.
          let ssrNamedModuleId = path.relative(compiler.context, modResource)
          if (!ssrNamedModuleId.startsWith('.')) {
            // TODO use getModuleId instead
            ssrNamedModuleId = `./${ssrNamedModuleId.replace(/\\/g, '/')}`
          }

          if (this.isEdgeServer) {
            edgeServerModuleIds.set(
              ssrNamedModuleId.replace(/\/next\/dist\/esm\//, '/next/dist/'),
              modId
            )
          } else {
            serverModuleIds.set(ssrNamedModuleId, modId)
          }
        }
      }

      traverseModules(compilation, (mod, _chunk, _chunkGroup, modId) => {
        recordModule(modId + '', mod)
      })
    })
  }

  async createClientEntries(compiler: any, compilation: any) {
    const promises: Array<
      ReturnType<typeof this.injectClientEntryAndSSRModules>
    > = []

    // Loop over all the entry modules.
    function forEachEntryModule(
      callback: ({
        name,
        entryModule,
      }: {
        name: string
        entryModule: any
      }) => void
    ) {
      for (const [name, entry] of compilation.entries.entries()) {
        // Skip for entries under pages/
        if (name.startsWith('pages/')) continue

        // Check if the page entry is a server component or not.
        const entryDependency: webpack.NormalModule | undefined =
          entry.dependencies?.[0]
        // Ensure only next-app-loader entries are handled.
        if (!entryDependency || !entryDependency.request) continue

        const request = entryDependency.request

        if (
          !request.startsWith('next-edge-ssr-loader?') &&
          !request.startsWith('next-app-loader?')
        )
          continue

        let entryModule: webpack.NormalModule =
          compilation.moduleGraph.getResolvedModule(entryDependency)

        if (request.startsWith('next-edge-ssr-loader?')) {
          entryModule.dependencies.forEach((dependency) => {
            const modRequest: string | undefined = (dependency as any).request
            if (modRequest?.includes('next-app-loader')) {
              entryModule =
                compilation.moduleGraph.getResolvedModule(dependency)
            }
          })
        }

        callback({ name, entryModule })
      }
    }

    // For each SC server compilation entry, we need to create its corresponding
    // client component entry.
    forEachEntryModule(({ name, entryModule }) => {
      const internalClientComponentEntryImports = new Set<
        ClientComponentImports[0]
      >()

      for (const connection of compilation.moduleGraph.getOutgoingConnections(
        entryModule
      )) {
        const layoutOrPageDependency = connection.dependency
        const layoutOrPageRequest = connection.dependency.request

        const [clientComponentImports] =
          this.collectClientComponentsAndCSSForDependency({
            layoutOrPageRequest,
            compilation,
            dependency: layoutOrPageDependency,
          })

        const isAbsoluteRequest = layoutOrPageRequest[0] === '/'

        // Next.js internals are put into a separate entry.
        if (!isAbsoluteRequest) {
          clientComponentImports.forEach((value) =>
            internalClientComponentEntryImports.add(value)
          )
          continue
        }

        const relativeRequest = isAbsoluteRequest
          ? path.relative(compilation.options.context, layoutOrPageRequest)
          : layoutOrPageRequest

        // Replace file suffix as `.js` will be added.
        const bundlePath = relativeRequest.replace(/\.(js|ts)x?$/, '')

        promises.push(
          this.injectClientEntryAndSSRModules({
            compiler,
            compilation,
            entryName: name,
            clientComponentImports,
            bundlePath,
          })
        )
      }

      // Create internal app
      promises.push(
        this.injectClientEntryAndSSRModules({
          compiler,
          compilation,
          entryName: name,
          clientComponentImports: [...internalClientComponentEntryImports],
          bundlePath: 'app-internals',
        })
      )
    })

    // After optimizing all the modules, we collect the CSS that are still used
    // by the certain chunk.
    compilation.hooks.afterOptimizeModules.tap(PLUGIN_NAME, () => {
      const cssImportsForChunk: Record<string, string[]> = {}

      function collectModule(entryName: string, mod: any) {
        const resource = mod.resource
        const modId = resource
        if (modId) {
          if (regexCSS.test(modId)) {
            cssImportsForChunk[entryName].push(modId)
          }
        }
      }

      compilation.chunkGroups.forEach((chunkGroup: any) => {
        chunkGroup.chunks.forEach((chunk: webpack.Chunk) => {
          // Here we only track page chunks.
          if (!chunk.name) return
          if (!chunk.name.endsWith('/page')) return

          const entryName = path.join(compiler.context, chunk.name)

          if (!cssImportsForChunk[entryName]) {
            cssImportsForChunk[entryName] = []
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
            flightCSSManifest.__entry_css__ || {}
          entryCSSInfo[entryName] = cssImportsForChunk[entryName]

          Object.assign(flightCSSManifest, {
            __entry_css__: entryCSSInfo,
          })
        })
      })

      forEachEntryModule(({ entryModule }) => {
        for (const connection of compilation.moduleGraph.getOutgoingConnections(
          entryModule
        )) {
          const layoutOrPageDependency = connection.dependency
          const layoutOrPageRequest = connection.dependency.request

          const [, cssImports] =
            this.collectClientComponentsAndCSSForDependency({
              layoutOrPageRequest,
              compilation,
              dependency: layoutOrPageDependency,
            })

          Object.assign(flightCSSManifest, cssImports)
        }
      })
    })

    compilation.hooks.processAssets.tap(
      {
        name: PLUGIN_NAME,
        // Have to be in the optimize stage to run after updating the CSS
        // asset hash via extract mini css plugin.
        stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
      },
      (assets: webpack.Compilation['assets']) => {
        const manifest = JSON.stringify(flightCSSManifest)
        assets[FLIGHT_SERVER_CSS_MANIFEST + '.json'] = new sources.RawSource(
          manifest
        ) as unknown as webpack.sources.RawSource
        assets[FLIGHT_SERVER_CSS_MANIFEST + '.js'] = new sources.RawSource(
          'self.__RSC_CSS_MANIFEST=' + manifest
        ) as unknown as webpack.sources.RawSource
      }
    )

    const res = await Promise.all(promises)

    // Invalidate in development to trigger recompilation
    const invalidator = getInvalidator()
    // Check if any of the entry injections need an invalidation
    if (invalidator && res.includes(true)) {
      invalidator.invalidate([COMPILER_NAMES.client])
    }
  }

  collectClientComponentsAndCSSForDependency({
    layoutOrPageRequest,
    compilation,
    dependency,
  }: {
    layoutOrPageRequest: string
    compilation: any
    dependency: any /* Dependency */
  }): [ClientComponentImports, CssImports] {
    /**
     * Keep track of checked modules to avoid infinite loops with recursive imports.
     */
    const visitedBySegment: { [segment: string]: Set<string> } = {}
    const clientComponentImports: ClientComponentImports = []
    const serverCSSImports: CssImports = {}

    const filterClientComponents = (
      dependencyToFilter: any,
      inClientComponentBoundary: boolean
    ): void => {
      const mod: webpack.NormalModule =
        compilation.moduleGraph.getResolvedModule(dependencyToFilter)
      if (!mod) return

      // Keep client imports as simple
      // native or installed js module: -> raw request, e.g. next/head
      // client js or css: -> user request
      const rawRequest = mod.rawRequest
      // Request could be undefined or ''
      if (!rawRequest) return

      const isCSS = regexCSS.test(rawRequest)
      const isLocal =
        !isCSS &&
        !rawRequest.startsWith('.') &&
        !rawRequest.startsWith('/') &&
        !rawRequest.startsWith(APP_DIR_ALIAS)

      const modRequest: string | undefined = isLocal
        ? rawRequest
        : mod.resourceResolveData?.path + mod.resourceResolveData?.query

      // Ensure module is not walked again if it's already been visited
      if (!visitedBySegment[layoutOrPageRequest]) {
        visitedBySegment[layoutOrPageRequest] = new Set()
      }
      if (
        !modRequest ||
        visitedBySegment[layoutOrPageRequest].has(modRequest)
      ) {
        return
      }
      visitedBySegment[layoutOrPageRequest].add(modRequest)

      const isClientComponent = isClientComponentModule(mod)

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

        serverCSSImports[layoutOrPageRequest] =
          serverCSSImports[layoutOrPageRequest] || []
        serverCSSImports[layoutOrPageRequest].push(modRequest)
      }

      // Check if request is for css file.
      if ((!inClientComponentBoundary && isClientComponent) || isCSS) {
        clientComponentImports.push(modRequest)

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

    // Traverse the module graph to find all client components.
    filterClientComponents(dependency, false)

    return [clientComponentImports, serverCSSImports]
  }

  async injectClientEntryAndSSRModules({
    compiler,
    compilation,
    entryName,
    clientComponentImports,
    bundlePath,
  }: {
    compiler: any
    compilation: any
    entryName: string
    clientComponentImports: ClientComponentImports
    bundlePath: string
  }): Promise<boolean> {
    let shouldInvalidate = false

    const loaderOptions: NextFlightClientEntryLoaderOptions = {
      modules: clientComponentImports,
      server: false,
    }

    // For the client entry, we always use the CJS build of Next.js. If the
    // server is using the ESM build (when using the Edge runtime), we need to
    // replace them.
    const clientLoader = `next-flight-client-entry-loader?${stringify({
      modules: this.isEdgeServer
        ? clientComponentImports.map((importPath) =>
            importPath.replace('next/dist/esm/', 'next/dist/')
          )
        : clientComponentImports,
      server: false,
    })}!`

    const clientSSRLoader = `next-flight-client-entry-loader?${stringify({
      ...loaderOptions,
      server: true,
    })}!`

    // Add for the client compilation
    // Inject the entry to the client compiler.
    if (this.dev) {
      const pageKey = COMPILER_NAMES.client + bundlePath
      if (!entries[pageKey]) {
        entries[pageKey] = {
          type: EntryTypes.CHILD_ENTRY,
          parentEntries: new Set([entryName]),
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
      }
    } else {
      injectedClientEntries.set(bundlePath, clientLoader)
    }

    // Inject the entry to the server compiler (__sc_client__).
    const clientComponentEntryDep = (
      webpack as any
    ).EntryPlugin.createDependency(clientSSRLoader, {
      name: bundlePath,
    })

    // Add the dependency to the server compiler.
    await this.addEntry(
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
    )

    return shouldInvalidate
  }

  // TODO-APP: make sure dependsOn is added for layouts/pages
  addEntry(
    compilation: any,
    context: string,
    entry: any /* Dependency */,
    options: {
      name: string
      layer: string | undefined
    } /* EntryOptions */
  ): Promise<any> /* Promise<module> */ {
    return new Promise((resolve, reject) => {
      compilation.entries.get(options.name).includeDependencies.push(entry)
      compilation.hooks.addEntry.call(entry, options)
      compilation.addModuleTree(
        {
          context,
          dependency: entry,
          contextInfo: { issuerLayer: options.layer },
        },
        (err: Error | undefined, module: any) => {
          if (err) {
            compilation.hooks.failedEntry.call(entry, options, err)
            return reject(err)
          }

          compilation.hooks.succeedEntry.call(entry, options, module)
          return resolve(module)
        }
      )
    })
  }
}

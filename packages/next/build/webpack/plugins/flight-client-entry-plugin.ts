import { stringify } from 'querystring'
import path from 'path'
import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import { clientComponentRegex } from '../loaders/utils'
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
import { APP_DIR_ALIAS } from '../../../lib/constants'
import {
  COMPILER_NAMES,
  FLIGHT_SERVER_CSS_MANIFEST,
} from '../../../shared/lib/constants'
import { FlightCSSManifest } from './flight-manifest-plugin'

interface Options {
  dev: boolean
  isEdgeServer: boolean
}

const PLUGIN_NAME = 'ClientEntryPlugin'

export const injectedClientEntries = new Map()

// TODO-APP: ensure .scss / .sass also works.
const regexCSS = /\.css$/

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
      return this.createClientEndpoints(compiler, compilation)
    })
  }

  async createClientEndpoints(compiler: any, compilation: any) {
    const promises: Array<
      ReturnType<typeof this.injectClientEntryAndSSRModules>
    > = []

    // For each SC server compilation entry, we need to create its corresponding
    // client component entry.
    for (const [name, entry] of compilation.entries.entries()) {
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
            entryModule = compilation.moduleGraph.getResolvedModule(dependency)
          }
        })
      }

      const internalClientComponentEntryImports = new Set<
        ClientComponentImports[0]
      >()

      for (const connection of compilation.moduleGraph.getOutgoingConnections(
        entryModule
      )) {
        const layoutOrPageDependency = connection.dependency
        const layoutOrPageRequest = connection.dependency.request

        const [clientComponentImports, cssImports] =
          this.collectClientComponentsAndCSSForDependency({
            layoutOrPageRequest,
            compilation,
            dependency: layoutOrPageDependency,
          })

        Object.assign(flightCSSManifest, cssImports)

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
        const bundlePath = relativeRequest.replace(
          /(\.server|\.client)?\.(js|ts)x?$/,
          ''
        )

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
    }

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

      const modRequest: string | undefined =
        !rawRequest.endsWith('.css') &&
        !rawRequest.startsWith('.') &&
        !rawRequest.startsWith('/') &&
        !rawRequest.startsWith(APP_DIR_ALIAS)
          ? rawRequest
          : mod.resourceResolveData?.path

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

      const isCSS = regexCSS.test(modRequest)
      const isClientComponent = clientComponentRegex.test(modRequest)

      if (isCSS) {
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
    const clientLoader = `next-flight-client-entry-loader?${stringify(
      loaderOptions
    )}!`
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
        // Layer should be undefined for the SSR modules
        // This ensures the client components are
        layer: undefined,
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

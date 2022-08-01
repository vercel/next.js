import { stringify } from 'querystring'
import { webpack } from 'next/dist/compiled/webpack/webpack'
import type { webpack5 } from 'next/dist/compiled/webpack/webpack'
import { clientComponentRegex } from '../loaders/utils'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import { denormalizePagePath } from '../../../shared/lib/page-path/denormalize-page-path'
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

interface Options {
  dev: boolean
  isEdgeServer: boolean
}

const PLUGIN_NAME = 'ClientEntryPlugin'

export const injectedClientEntries = new Map()
// TODO-APP: ensure .scss / .sass also works.
const regexCSS = /\.css$/

export class FlightClientEntryPlugin {
  dev: boolean
  isEdgeServer: boolean

  constructor(options: Options) {
    this.dev = options.dev
    this.isEdgeServer = options.isEdgeServer
  }

  apply(compiler: webpack5.Compiler) {
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
    const promises: Array<Promise<void>> = []

    // For each SC server compilation entry, we need to create its corresponding
    // client component entry.
    for (const [name, entry] of compilation.entries.entries()) {
      // If the request is not for `app` directory entry skip it.
      // if (!entry.request || !entry.request.startsWith('next-app-loader')) {
      //   continue
      // }

      // Check if the page entry is a server component or not.
      const entryDependency = entry.dependencies?.[0]
      // Ensure only next-app-loader entries are handled.
      if (
        !entryDependency ||
        !entryDependency.request ||
        !entryDependency.request.startsWith('next-app-loader?')
      ) {
        continue
      }

      // TODO-APP: create client-side entrypoint per layout/page.
      // const entryModule: webpack5.NormalModule =
      //   compilation.moduleGraph.getResolvedModule(entryDependency)

      // for (const connection of compilation.moduleGraph.getOutgoingConnections(
      //   entryModule
      // )) {
      //   const layoutOrPageDependency = connection.dependency
      //   // const layoutOrPageRequest = connection.dependency.request

      //   const [clientComponentImports, cssImports] =
      //     this.collectClientComponentsAndCSSForDependency(
      //       compilation,
      //       layoutOrPageDependency
      //     )

      //   promises.push(
      //     this.injectClientEntryAndSSRModules(
      //       compiler,
      //       compilation,
      //       name,
      //       entryDependency,
      //       clientComponentImports,
      //       cssImports
      //     )
      //   )
      // }
      const [clientComponentImports, cssImports] =
        this.collectClientComponentsAndCSSForDependency(
          compilation,
          entryDependency
        )

      promises.push(
        this.injectClientEntryAndSSRModules(
          compiler,
          compilation,
          name,
          entryDependency,
          clientComponentImports,
          cssImports
        )
      )
    }

    await Promise.all(promises)
  }

  collectClientComponentsAndCSSForDependency(
    compilation: any,
    dependency: any /* Dependency */
  ): [ClientComponentImports, CssImports] {
    /**
     * Keep track of checked modules to avoid infinite loops with recursive imports.
     */
    const visited: Set<string> = new Set()
    const clientComponentImports: ClientComponentImports = []
    const serverCSSImports: CssImports = {}

    const filterClientComponents = (
      dependencyToFilter: any,
      layoutOrPage: string
    ): void => {
      const mod: webpack5.NormalModule =
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
      if (!modRequest || visited.has(modRequest)) return
      visited.add(modRequest)

      const isLayoutOrPage =
        /\/(layout|page)(\.server|\.client)?\.(js|ts)x?$/.test(modRequest)
      const isCSS = regexCSS.test(modRequest)
      const isClientComponent = clientComponentRegex.test(modRequest)

      if (isCSS) {
        serverCSSImports[layoutOrPage] = serverCSSImports[layoutOrPage] || []
        serverCSSImports[layoutOrPage].push(modRequest)
      }

      // Check if request is for css file.
      if (isClientComponent || isCSS) {
        clientComponentImports.push(modRequest)
        return
      }

      compilation.moduleGraph
        .getOutgoingConnections(mod)
        .forEach((connection: any) => {
          filterClientComponents(
            connection.dependency,
            isLayoutOrPage ? modRequest : layoutOrPage
          )
        })
    }

    // Traverse the module graph to find all client components.
    filterClientComponents(dependency, '')

    return [clientComponentImports, serverCSSImports]
  }

  async injectClientEntryAndSSRModules(
    compiler: any,
    compilation: any,
    entryName: string,
    entryDependency: any,
    clientComponentImports: ClientComponentImports,
    serverCSSImports: CssImports
  ) {
    const entryModule =
      compilation.moduleGraph.getResolvedModule(entryDependency)
    const routeInfo = entryModule.buildInfo.route || {
      page: denormalizePagePath(entryName.replace(/^pages/, '')),
      absolutePagePath: entryModule.resource,
    }

    const loaderOptions: NextFlightClientEntryLoaderOptions = {
      css: JSON.stringify(serverCSSImports),
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

    const bundlePath = 'app' + normalizePagePath(routeInfo.page)

    // Add for the client compilation
    // Inject the entry to the client compiler.
    if (this.dev) {
      const pageKey = 'client' + routeInfo.page
      if (!entries[pageKey]) {
        entries[pageKey] = {
          type: EntryTypes.CHILD_ENTRY,
          parentEntries: new Set([entryName]),
          bundlePath,
          // absolutePagePath: routeInfo.absolutePagePath,
          request: clientLoader,
          dispose: false,
          lastActiveTime: Date.now(),
        }
        const invalidator = getInvalidator()
        if (invalidator) {
          invalidator.invalidate()
        }
      } else {
        const entryData = entries[pageKey]
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
  }

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

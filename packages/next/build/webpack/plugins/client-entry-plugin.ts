import { stringify } from 'querystring'
import { webpack } from 'next/dist/compiled/webpack/webpack'
import {
  EDGE_RUNTIME_WEBPACK,
  NEXT_CLIENT_SSR_ENTRY_SUFFIX,
} from '../../../shared/lib/constants'
import { clientComponentRegex } from '../loaders/utils'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import { denormalizePagePath } from '../../../shared/lib/page-path/denormalize-page-path'
import {
  getInvalidator,
  entries,
} from '../../../server/dev/on-demand-entry-handler'
import { getPageStaticInfo } from '../../analysis/get-page-static-info'
import { SERVER_RUNTIME } from '../../../lib/constants'

type Options = {
  dev: boolean
  isEdgeServer: boolean
}

const PLUGIN_NAME = 'ClientEntryPlugin'

export const injectedClientEntries = new Map()

export class ClientEntryPlugin {
  dev: boolean = false
  isEdgeServer: boolean

  constructor(options: Options) {
    if (typeof options.dev === 'boolean') {
      this.dev = options.dev
    }
    this.isEdgeServer = options.isEdgeServer
  }

  apply(compiler: any) {
    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation: any, { normalModuleFactory }: any) => {
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

    // Only for webpack 5
    compiler.hooks.finishMake.tapAsync(
      PLUGIN_NAME,
      async (compilation: any, callback: any) => {
        this.createClientEndpoints(compilation, callback)
      }
    )
  }

  async createClientEndpoints(compilation: any, callback: () => void) {
    const context = (this as any).context
    const promises: any = []

    // For each SC server compilation entry, we need to create its corresponding
    // client component entry.
    for (const [name, entry] of compilation.entries.entries()) {
      // Check if the page entry is a server component or not.
      const entryDependency = entry.dependencies?.[0]
      const request = entryDependency?.request

      if (request && entry.options?.layer === 'sc_server') {
        const visited = new Set()
        const clientComponentImports: string[] = []

        function filterClientComponents(dependency: any) {
          const module = compilation.moduleGraph.getResolvedModule(dependency)
          if (!module) return

          if (visited.has(module.userRequest)) return
          visited.add(module.userRequest)

          if (clientComponentRegex.test(module.userRequest)) {
            clientComponentImports.push(module.userRequest)
          }

          compilation.moduleGraph
            .getOutgoingConnections(module)
            .forEach((connection: any) => {
              filterClientComponents(connection.dependency)
            })
        }

        // Traverse the module graph to find all client components.
        filterClientComponents(entryDependency)

        const entryModule =
          compilation.moduleGraph.getResolvedModule(entryDependency)
        const routeInfo = entryModule.buildInfo.route || {
          page: denormalizePagePath(name.replace(/^pages/, '')),
          absolutePagePath: entryModule.resource,
        }

        // Parse gSSP and gSP exports from the page source.
        const pageStaticInfo = this.isEdgeServer
          ? {}
          : await getPageStaticInfo({
              pageFilePath: routeInfo.absolutePagePath,
              nextConfig: {},
              isDev: this.dev,
            })

        const clientLoader = `next-flight-client-entry-loader?${stringify({
          modules: clientComponentImports,
          runtime: this.isEdgeServer
            ? SERVER_RUNTIME.edge
            : SERVER_RUNTIME.nodejs,
          ssr: pageStaticInfo.ssr,
          // Adding name here to make the entry key unique.
          name,
        })}!`

        const bundlePath = 'pages' + normalizePagePath(routeInfo.page)

        // Inject the entry to the client compiler.
        if (this.dev) {
          const pageKey = 'client' + routeInfo.page
          if (!entries[pageKey]) {
            entries[pageKey] = {
              bundlePath,
              absolutePagePath: routeInfo.absolutePagePath,
              clientLoader,
              dispose: false,
              lastActiveTime: Date.now(),
            } as any
            const invalidator = getInvalidator()
            if (invalidator) {
              invalidator.invalidate()
            }
          }
        } else {
          injectedClientEntries.set(
            bundlePath,
            `next-client-pages-loader?${stringify({
              isServerComponent: true,
              page: denormalizePagePath(bundlePath.replace(/^pages/, '')),
              absolutePagePath: clientLoader,
            })}!` + clientLoader
          )
        }

        // Inject the entry to the server compiler.
        const clientComponentEntryDep = (
          webpack as any
        ).EntryPlugin.createDependency(
          clientLoader,
          name + NEXT_CLIENT_SSR_ENTRY_SUFFIX
        )
        promises.push(
          new Promise<void>((res, rej) => {
            compilation.addEntry(
              context,
              clientComponentEntryDep,
              this.isEdgeServer
                ? {
                    name: name + NEXT_CLIENT_SSR_ENTRY_SUFFIX,
                    library: {
                      name: ['self._CLIENT_ENTRY'],
                      type: 'assign',
                    },
                    runtime: EDGE_RUNTIME_WEBPACK,
                    asyncChunks: false,
                  }
                : {
                    name: name + NEXT_CLIENT_SSR_ENTRY_SUFFIX,
                    runtime: 'webpack-runtime',
                  },
              (err: any) => {
                if (err) {
                  rej(err)
                } else {
                  res()
                }
              }
            )
          })
        )
      }
    }

    Promise.all(promises)
      .then(() => callback())
      .catch(callback)
  }
}

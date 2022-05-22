/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { stringify } from 'querystring'
import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import {
  MIDDLEWARE_FLIGHT_MANIFEST,
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

// This is the module that will be used to anchor all client references to.
// I.e. it will have all the client files as async deps from this point on.
// We use the Flight client implementation because you can't get to these
// without the client runtime so it's the first time in the loading sequence
// you might want them.
// const clientFileName = require.resolve('../');

type Options = {
  dev: boolean
  pageExtensions: string[]
  isEdgeServer: boolean
}

const PLUGIN_NAME = 'FlightManifestPlugin'

let edgeFlightManifest = {}
let nodeFlightManifest = {}

export const injectedClientEntries = new Map()

export class FlightManifestPlugin {
  dev: boolean = false
  pageExtensions: string[]
  isEdgeServer: boolean

  constructor(options: Options) {
    if (typeof options.dev === 'boolean') {
      this.dev = options.dev
    }
    this.pageExtensions = options.pageExtensions
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

    compiler.hooks.make.tap(PLUGIN_NAME, (compilation: any) => {
      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          // @ts-ignore TODO: Remove ignore when webpack 5 is stable
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        (assets: any) => this.createAsset(assets, compilation)
      )
    })
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
          runtime: this.isEdgeServer ? 'edge' : 'nodejs',
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

  createAsset(assets: any, compilation: any) {
    const manifest: any = {}
    compilation.chunkGroups.forEach((chunkGroup: any) => {
      function recordModule(id: string, _chunk: any, mod: any) {
        const resource = mod.resource

        // TODO: Hook into deps instead of the target module.
        // That way we know by the type of dep whether to include.
        // It also resolves conflicts when the same module is in multiple chunks.
        if (
          !resource ||
          !clientComponentRegex.test(resource) ||
          !clientComponentRegex.test(id)
        ) {
          return
        }

        const moduleExports: any = manifest[resource] || {}

        const exportsInfo = compilation.moduleGraph.getExportsInfo(mod)
        const moduleExportedKeys = ['', '*'].concat(
          [...exportsInfo.exports]
            .map((exportInfo) => {
              if (exportInfo.provided) {
                return exportInfo.name
              }
              return null
            })
            .filter(Boolean)
        )

        moduleExportedKeys.forEach((name) => {
          if (!moduleExports[name]) {
            moduleExports[name] = {
              id: id.replace(/^\(sc_server\)\//, ''),
              name,
              chunks: [],
            }
          }
        })
        manifest[resource] = moduleExports
      }

      chunkGroup.chunks.forEach((chunk: any) => {
        const chunkModules =
          compilation.chunkGraph.getChunkModulesIterable(chunk)
        for (const mod of chunkModules) {
          let modId = compilation.chunkGraph.getModuleId(mod)

          if (typeof modId !== 'string') continue

          // Remove resource queries.
          modId = modId.split('?')[0]
          // Remove the loader prefix.
          modId = modId.split('next-flight-client-loader.js!')[1] || modId

          recordModule(modId, chunk, mod)
          // If this is a concatenation, register each child to the parent ID.
          if (mod.modules) {
            mod.modules.forEach((concatenatedMod: any) => {
              recordModule(modId, chunk, concatenatedMod)
            })
          }
        }
      })
    })

    // With switchable runtime, we need to emit the manifest files for both
    // runtimes.
    if (this.isEdgeServer) {
      edgeFlightManifest = manifest
    } else {
      nodeFlightManifest = manifest
    }
    const mergedManifest = {
      ...nodeFlightManifest,
      ...edgeFlightManifest,
    }
    const file =
      (!this.dev && !this.isEdgeServer ? '../' : '') +
      MIDDLEWARE_FLIGHT_MANIFEST
    const json = JSON.stringify(mergedManifest)

    assets[file + '.js'] = new sources.RawSource('self.__RSC_MANIFEST=' + json)
    assets[file + '.json'] = new sources.RawSource(json)
  }
}

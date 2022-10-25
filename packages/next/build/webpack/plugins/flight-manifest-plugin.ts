/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import { FLIGHT_MANIFEST } from '../../../shared/lib/constants'
import { relative } from 'path'
import { isClientComponentModule, regexCSS } from '../loaders/utils'

import {
  edgeServerModuleIds,
  serverModuleIds,
} from './flight-client-entry-plugin'

import { traverseModules } from '../utils'

// This is the module that will be used to anchor all client references to.
// I.e. it will have all the client files as async deps from this point on.
// We use the Flight client implementation because you can't get to these
// without the client runtime so it's the first time in the loading sequence
// you might want them.
// const clientFileName = require.resolve('../');

interface Options {
  dev: boolean
}

/**
 * Webpack module id
 */
// TODO-APP ensure `null` is included as it is used.
type ModuleId = string | number /*| null*/

export type ManifestChunks = Array<`${string}:${string}` | string>

interface ManifestNode {
  [moduleExport: string]: {
    /**
     * Webpack module id
     */
    id: ModuleId
    /**
     * Export name
     */
    name: string
    /**
     * Chunks for the module. JS and CSS.
     */
    chunks: ManifestChunks

    /**
     * If chunk contains async module
     */
    async?: boolean
  }
}

export type FlightManifest = {
  __ssr_module_mapping__: {
    [moduleId: string]: ManifestNode
  }
  __edge_ssr_module_mapping__: {
    [moduleId: string]: ManifestNode
  }
} & {
  [modulePath: string]: ManifestNode
}

export type FlightCSSManifest = {
  [modulePath: string]: string[]
} & {
  __entry_css__?: {
    [entry: string]: string[]
  }
}

const PLUGIN_NAME = 'FlightManifestPlugin'

// Collect modules from server/edge compiler in client layer,
// and detect if it's been used, and mark it as `async: true` for react.
// So that react could unwrap the async module from promise and render module itself.
export const ASYNC_CLIENT_MODULES = new Set<string>()

export class FlightManifestPlugin {
  dev: Options['dev'] = false

  constructor(options: Options) {
    this.dev = options.dev
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

    compiler.hooks.make.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          // Have to be in the optimize stage to run after updating the CSS
          // asset hash via extract mini css plugin.
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
        },
        (assets) => this.createAsset(assets, compilation, compiler.context)
      )
    })
  }

  createAsset(
    assets: webpack.Compilation['assets'],
    compilation: webpack.Compilation,
    context: string
  ) {
    const manifest: FlightManifest = {
      __ssr_module_mapping__: {},
      __edge_ssr_module_mapping__: {},
    }
    const dev = this.dev

    const clientRequestsSet = new Set()

    // Collect client requests
    function collectClientRequest(mod: webpack.NormalModule) {
      if (mod.resource === '' && mod.buildInfo.rsc) {
        const { requests = [] } = mod.buildInfo.rsc
        requests.forEach((r: string) => {
          clientRequestsSet.add(r)
        })
      }
    }

    traverseModules(compilation, (mod) => collectClientRequest(mod))

    compilation.chunkGroups.forEach((chunkGroup) => {
      const cssResourcesInChunkGroup = new Set<string>()
      let entryFilepath: string = ''

      function recordModule(
        chunk: webpack.Chunk,
        id: ModuleId,
        mod: webpack.NormalModule
      ) {
        const isCSSModule =
          regexCSS.test(mod.resource) ||
          mod.type === 'css/mini-extract' ||
          (!!mod.loaders &&
            (dev
              ? mod.loaders.some((item) =>
                  item.loader.includes('next-style-loader/index.js')
                )
              : mod.loaders.some((item) =>
                  item.loader.includes('mini-css-extract-plugin/loader.js')
                )))

        const resource =
          mod.type === 'css/mini-extract'
            ? // @ts-expect-error TODO: use `identifier()` instead.
              mod._identifier.slice(mod._identifier.lastIndexOf('!') + 1)
            : mod.resource

        if (!resource) {
          return
        }

        const moduleExports = manifest[resource] || {}
        const moduleIdMapping = manifest.__ssr_module_mapping__
        const edgeModuleIdMapping = manifest.__edge_ssr_module_mapping__

        // Note that this isn't that reliable as webpack is still possible to assign
        // additional queries to make sure there's no conflict even using the `named`
        // module ID strategy.
        let ssrNamedModuleId = relative(
          context,
          mod.resourceResolveData?.path || resource
        )

        if (!ssrNamedModuleId.startsWith('.'))
          ssrNamedModuleId = `./${ssrNamedModuleId.replace(/\\/g, '/')}`

        if (isCSSModule) {
          if (!manifest[resource]) {
            const chunks = [...chunk.files].filter((f) => f.endsWith('.css'))
            manifest[resource] = {
              default: {
                id,
                name: 'default',
                chunks,
              },
            }
          }

          if (chunkGroup.name) {
            cssResourcesInChunkGroup.add(resource)
          }

          return
        }

        // Only apply following logic to client module requests from client entry,
        // or if the module is marked as client module.
        if (!clientRequestsSet.has(resource) && !isClientComponentModule(mod)) {
          return
        }

        if (/[\\/](page|layout)\.(ts|js)x?$/.test(resource)) {
          entryFilepath = resource
        }

        const exportsInfo = compilation.moduleGraph.getExportsInfo(mod)
        const isAsyncModule = ASYNC_CLIENT_MODULES.has(mod.resource)

        const cjsExports = [
          ...new Set([
            ...mod.dependencies.map((dep) => {
              // Match CommonJsSelfReferenceDependency
              if (dep.type === 'cjs self exports reference') {
                // @ts-expect-error: TODO: Fix Dependency type
                if (dep.base === 'module.exports') {
                  return 'default'
                }

                // `exports.foo = ...`, `exports.default = ...`
                // @ts-expect-error: TODO: Fix Dependency type
                if (dep.base === 'exports') {
                  // @ts-expect-error: TODO: Fix Dependency type
                  return dep.names.filter((name: any) => name !== '__esModule')
                }
              }
              return null
            }),
          ]),
        ]

        function getAppPathRequiredChunks() {
          return chunkGroup.chunks.map((requiredChunk: webpack.Chunk) => {
            return (
              requiredChunk.id +
              ':' +
              (requiredChunk.name || requiredChunk.id) +
              (dev ? '' : '-' + requiredChunk.hash)
            )
          })
        }

        const moduleExportedKeys = ['', '*']
          .concat(
            [...exportsInfo.exports]
              .filter((exportInfo) => exportInfo.provided)
              .map((exportInfo) => exportInfo.name),
            ...cjsExports
          )
          .filter((name) => name !== null)

        moduleExportedKeys.forEach((name) => {
          // If the chunk is from `app/` chunkGroup, use it first.
          // This make sure not to load the overlapped chunk from `pages/` chunkGroup
          if (!moduleExports[name] || chunkGroup.name?.startsWith('app/')) {
            const requiredChunks = getAppPathRequiredChunks()

            moduleExports[name] = {
              id,
              name,
              chunks: requiredChunks,
              // E.g.
              // page (server) -> local module (client) -> package (esm)
              // The esm package will bubble up to make the entire chain till the client entry as async module.
              async: isAsyncModule,
            }
          }

          if (serverModuleIds.has(ssrNamedModuleId)) {
            moduleIdMapping[id] = moduleIdMapping[id] || {}
            moduleIdMapping[id][name] = {
              ...moduleExports[name],
              id: serverModuleIds.get(ssrNamedModuleId)!,
            }
          }

          if (edgeServerModuleIds.has(ssrNamedModuleId)) {
            edgeModuleIdMapping[id] = edgeModuleIdMapping[id] || {}
            edgeModuleIdMapping[id][name] = {
              ...moduleExports[name],
              id: edgeServerModuleIds.get(ssrNamedModuleId)!,
            }
          }
        })

        manifest[resource] = moduleExports

        // The client compiler will always use the CJS Next.js build, so here we
        // also add the mapping for the ESM build (Edge runtime) to consume.
        if (/\/next\/dist\//.test(resource)) {
          manifest[resource.replace(/\/next\/dist\//, '/next/dist/esm/')] =
            moduleExports
        }

        manifest.__ssr_module_mapping__ = moduleIdMapping
        manifest.__edge_ssr_module_mapping__ = edgeModuleIdMapping
      }

      chunkGroup.chunks.forEach((chunk: webpack.Chunk) => {
        const chunkModules = compilation.chunkGraph.getChunkModulesIterable(
          chunk
          // TODO: Update type so that it doesn't have to be cast.
        ) as Iterable<webpack.NormalModule>
        for (const mod of chunkModules) {
          const modId: string = compilation.chunkGraph.getModuleId(mod) + ''

          recordModule(chunk, modId, mod)

          // If this is a concatenation, register each child to the parent ID.
          // TODO: remove any
          const anyModule = mod as any
          if (anyModule.modules) {
            anyModule.modules.forEach((concatenatedMod: any) => {
              recordModule(chunk, modId, concatenatedMod)
            })
          }
        }
      })

      const clientCSSManifest: any = manifest.__client_css_manifest__ || {}
      if (entryFilepath) {
        clientCSSManifest[entryFilepath] = Array.from(cssResourcesInChunkGroup)
      }
      manifest.__client_css_manifest__ = clientCSSManifest
    })

    const file = 'server/' + FLIGHT_MANIFEST
    const json = JSON.stringify(manifest)

    ASYNC_CLIENT_MODULES.clear()

    assets[file + '.js'] = new sources.RawSource(
      'self.__RSC_MANIFEST=' + json
      // Work around webpack 4 type of RawSource being used
      // TODO: use webpack 5 type by default
    ) as unknown as webpack.sources.RawSource
    assets[file + '.json'] = new sources.RawSource(
      json
      // Work around webpack 4 type of RawSource being used
      // TODO: use webpack 5 type by default
    ) as unknown as webpack.sources.RawSource
  }
}

/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import { FLIGHT_MANIFEST } from '../../../shared/lib/constants'
import { clientComponentRegex } from '../loaders/utils'
import { relative } from 'path'
import type { webpack5 } from 'next/dist/compiled/webpack/webpack'

// This is the module that will be used to anchor all client references to.
// I.e. it will have all the client files as async deps from this point on.
// We use the Flight client implementation because you can't get to these
// without the client runtime so it's the first time in the loading sequence
// you might want them.
// const clientFileName = require.resolve('../');

type Options = {
  dev: boolean
  appDir: boolean
  pageExtensions: string[]
}

const PLUGIN_NAME = 'FlightManifestPlugin'

export class FlightManifestPlugin {
  dev: boolean = false
  pageExtensions: string[]
  appDir: boolean = false

  constructor(options: Options) {
    if (typeof options.dev === 'boolean') {
      this.dev = options.dev
    }
    this.appDir = options.appDir
    this.pageExtensions = options.pageExtensions
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

    compiler.hooks.make.tap(PLUGIN_NAME, (compilation: any) => {
      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          // @ts-ignore TODO: Remove ignore when webpack 5 is stable
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        (assets: any) => this.createAsset(assets, compilation, compiler.context)
      )
    })
  }

  createAsset(assets: any, compilation: webpack5.Compilation, context: string) {
    const manifest: any = {}
    const appDir = this.appDir
    const dev = this.dev

    compilation.chunkGroups.forEach((chunkGroup: any) => {
      function recordModule(
        chunk: webpack5.Chunk,
        id: string | number,
        mod: any
      ) {
        const resource: string = mod.resource
        if (!resource) return

        const moduleExports: any = manifest[resource] || {}
        const moduleIdMapping: any = manifest.__ssr_module_mapping__ || {}
        moduleIdMapping[id] = moduleIdMapping[id] || {}

        // Note that this isn't that reliable as webpack is still possible to assign
        // additional queries to make sure there's no conflict even using the `named`
        // module ID strategy.
        let ssrNamedModuleId = relative(context, mod.resourceResolveData.path)
        if (!ssrNamedModuleId.startsWith('.'))
          ssrNamedModuleId = `./${ssrNamedModuleId}`

        if (
          mod.request &&
          /(?<!\.module)\.css$/.test(mod.request) &&
          ((dev &&
            mod.request.includes(
              'webpack/loaders/next-style-loader/index.js'
            )) ||
            (!dev &&
              mod.request.includes('webpack/loaders/css-loader/src/index.js')))
        ) {
          if (!manifest[resource]) {
            if (dev) {
              const chunkIdNameMapping = (chunk.ids || []).map((chunkId) => {
                return (
                  chunkId +
                  ':' +
                  (chunk.name || chunk.id) +
                  (dev ? '' : '-' + chunk.hash)
                )
              })
              manifest[resource] = {
                default: {
                  id,
                  name: 'default',
                  chunks: chunkIdNameMapping,
                },
              }
              moduleIdMapping[id]['default'] = {
                id: ssrNamedModuleId,
                name: 'default',
                chunks: chunkIdNameMapping,
              }
              manifest.__ssr_module_mapping__ = moduleIdMapping
            } else {
              const chunks = [...chunk.files].filter((f) => f.endsWith('.css'))
              manifest[resource] = {
                default: {
                  id,
                  name: 'default',
                  chunks,
                },
              }
              moduleIdMapping[id]['default'] = {
                id: ssrNamedModuleId,
                name: 'default',
                chunks,
              }
              manifest.__ssr_module_mapping__ = moduleIdMapping
            }
          }
          return
        }

        // TODO: Hook into deps instead of the target module.
        // That way we know by the type of dep whether to include.
        // It also resolves conflicts when the same module is in multiple chunks.
        if (!clientComponentRegex.test(resource)) {
          return
        }

        const exportsInfo = compilation.moduleGraph.getExportsInfo(mod)
        const cjsExports = [
          ...new Set(
            [].concat(
              mod.dependencies.map((dep: any) => {
                // Match CommonJsSelfReferenceDependency
                if (dep.type === 'cjs self exports reference') {
                  // `module.exports = ...`
                  if (dep.base === 'module.exports') {
                    return 'default'
                  }

                  // `exports.foo = ...`, `exports.default = ...`
                  if (dep.base === 'exports') {
                    return dep.names.filter(
                      (name: any) => name !== '__esModule'
                    )
                  }
                }
                return null
              })
            )
          ),
        ]

        const moduleExportedKeys = ['', '*']
          .concat(
            [...exportsInfo.exports]
              .filter((exportInfo) => exportInfo.provided)
              .map((exportInfo) => exportInfo.name),
            ...cjsExports
          )
          .filter((name) => name !== null)

        // Get all CSS files imported from the module's dependencies.
        const visitedCss = new Set()
        const cssChunks: string[] = []

        function collectClientImportedCss(module: any) {
          if (!module) return

          const modRequest = module.userRequest
          if (visitedCss.has(modRequest)) return
          visitedCss.add(modRequest)

          if (/\.css$/.test(modRequest)) {
            // collect relative imported css chunks
            compilation.chunkGraph.getModuleChunks(module).forEach((c) => {
              ;[...c.files]
                .filter((file) => file.endsWith('.css'))
                .forEach((file) => cssChunks.push(file))
            })
          }

          const connections = Array.from(
            compilation.moduleGraph.getOutgoingConnections(module)
          )
          connections.forEach((connection) => {
            collectClientImportedCss(
              compilation.moduleGraph.getResolvedModule(connection.dependency!)
            )
          })
        }
        collectClientImportedCss(mod)

        moduleExportedKeys.forEach((name) => {
          let requiredChunks = []
          if (!moduleExports[name]) {
            const isRelatedChunk = (c: webpack5.Chunk) =>
              // If current chunk is a page, it should require the related page chunk;
              // If current chunk is a component, it should filter out the related page chunk;
              chunk.name?.startsWith('pages/') || !c.name?.startsWith('pages/')

            if (appDir) {
              requiredChunks = chunkGroup.chunks
                .filter(isRelatedChunk)
                .map((requiredChunk: webpack5.Chunk) => {
                  return (
                    requiredChunk.id +
                    ':' +
                    (requiredChunk.name || requiredChunk.id) +
                    (dev ? '' : '-' + requiredChunk.hash)
                  )
                })
            }

            moduleExports[name] = {
              id,
              name,
              chunks: requiredChunks.concat(cssChunks),
            }
          }
          if (!moduleIdMapping[id][name]) {
            moduleIdMapping[id][name] = {
              ...moduleExports[name],
              id: ssrNamedModuleId,
            }
          }
        })

        manifest[resource] = moduleExports
        manifest.__ssr_module_mapping__ = moduleIdMapping
      }

      chunkGroup.chunks.forEach((chunk: webpack5.Chunk) => {
        const chunkModules =
          compilation.chunkGraph.getChunkModulesIterable(chunk)
        for (const mod of chunkModules) {
          const modId = compilation.chunkGraph.getModuleId(mod)

          recordModule(chunk, modId, mod)

          // If this is a concatenation, register each child to the parent ID.
          const anyModule = mod as any
          if (anyModule.modules) {
            anyModule.modules.forEach((concatenatedMod: any) => {
              recordModule(chunk, modId, concatenatedMod)
            })
          }
        }
      })
    })

    const file = 'server/' + FLIGHT_MANIFEST
    const json = JSON.stringify(manifest)

    assets[file + '.js'] = new sources.RawSource('self.__RSC_MANIFEST=' + json)
    assets[file + '.json'] = new sources.RawSource(json)
  }
}

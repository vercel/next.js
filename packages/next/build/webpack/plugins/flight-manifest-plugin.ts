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

  createAsset(assets: any, compilation: any, context: string) {
    const manifest: any = {}
    const appDir = this.appDir
    const dev = this.dev

    compilation.chunkGroups.forEach((chunkGroup: any) => {
      function recordModule(chunk: any, id: string | number, mod: any) {
        const resource: string = mod.resource

        // TODO: Hook into deps instead of the target module.
        // That way we know by the type of dep whether to include.
        // It also resolves conflicts when the same module is in multiple chunks.
        if (!resource || !clientComponentRegex.test(resource)) {
          return
        }

        const moduleExports: any = manifest[resource] || {}
        const moduleIdMapping: any = manifest.__ssr_module_mapping__ || {}
        moduleIdMapping[id] = moduleIdMapping[id] || {}

        // Note that this isn't that reliable as webpack is still possible to assign
        // additional queries to make sure there's no conflict even using the `named`
        // module ID strategy.
        let ssrNamedModuleId = relative(context, mod.resourceResolveData.path)
        if (!ssrNamedModuleId.startsWith('.'))
          ssrNamedModuleId = `./${ssrNamedModuleId}`

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
            [...exportsInfo.exports].map((exportInfo) => {
              if (exportInfo.provided) {
                return exportInfo.name
              }
              return null
            }),
            ...cjsExports
          )
          .filter((name) => name !== null)

        moduleExportedKeys.forEach((name) => {
          if (!moduleExports[name]) {
            moduleExports[name] = {
              id,
              name,
              chunks: appDir
                ? chunk.ids.map((chunkId: string) => {
                    return (
                      chunkId +
                      ':' +
                      (chunk.name || chunkId) +
                      (dev ? '' : '-' + chunk.hash)
                    )
                  })
                : [],
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

      chunkGroup.chunks.forEach((chunk: any) => {
        const chunkModules =
          compilation.chunkGraph.getChunkModulesIterable(chunk)
        for (const mod of chunkModules) {
          const modId = compilation.chunkGraph.getModuleId(mod)

          recordModule(chunk, modId, mod)

          // If this is a concatenation, register each child to the parent ID.
          if (mod.modules) {
            mod.modules.forEach((concatenatedMod: any) => {
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

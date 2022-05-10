/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import { MIDDLEWARE_FLIGHT_MANIFEST } from '../../../shared/lib/constants'
import { createClientComponentFilter } from '../loaders/utils'

// This is the module that will be used to anchor all client references to.
// I.e. it will have all the client files as async deps from this point on.
// We use the Flight client implementation because you can't get to these
// without the client runtime so it's the first time in the loading sequence
// you might want them.
// const clientFileName = require.resolve('../');

type Options = {
  dev: boolean
  pageExtensions: string[]
}

const PLUGIN_NAME = 'FlightManifestPlugin'

const isClientComponent = createClientComponentFilter()
export class FlightManifestPlugin {
  dev: boolean = false
  pageExtensions: string[]

  constructor(options: Options) {
    if (typeof options.dev === 'boolean') {
      this.dev = options.dev
    }
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

    // Only for webpack 5
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

  createAsset(assets: any, compilation: any) {
    const manifest: any = {}
    compilation.chunkGroups.forEach((chunkGroup: any) => {
      function recordModule(id: string, _chunk: any, mod: any) {
        const resource = mod.resource

        // TODO: Hook into deps instead of the target module.
        // That way we know by the type of dep whether to include.
        // It also resolves conflicts when the same module is in multiple chunks.
        if (!resource || !isClientComponent(resource)) {
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
              id,
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

          // remove resource query on production
          if (typeof modId === 'string') {
            modId = modId.split('?')[0]
          }
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
    const file = `server/${MIDDLEWARE_FLIGHT_MANIFEST}`
    const json = JSON.stringify(manifest)

    assets[file + '.js'] = new sources.RawSource('self.__RSC_MANIFEST=' + json)
    assets[file + '.json'] = new sources.RawSource(json)
  }
}

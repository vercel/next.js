/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import { MIDDLEWARE_FLIGHT_MANIFEST } from '../../../shared/lib/constants'
import { clientComponentRegex } from '../loaders/utils'

// This is the module that will be used to anchor all client references to.
// I.e. it will have all the client files as async deps from this point on.
// We use the Flight client implementation because you can't get to these
// without the client runtime so it's the first time in the loading sequence
// you might want them.
// const clientFileName = require.resolve('../');

type Options = {
  dev: boolean
  viewsDir: boolean
  pageExtensions: string[]
}

const PLUGIN_NAME = 'FlightManifestPlugin'

export class FlightManifestPlugin {
  dev: boolean = false
  pageExtensions: string[]
  viewsDir: boolean = false

  constructor(options: Options) {
    if (typeof options.dev === 'boolean') {
      this.dev = options.dev
    }
    this.viewsDir = options.viewsDir
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
        (assets: any) => this.createAsset(assets, compilation)
      )
    })
  }

  createAsset(assets: any, compilation: any) {
    const manifest: any = {}
    const viewsDir = this.viewsDir

    compilation.chunkGroups.forEach((chunkGroup: any) => {
      function recordModule(chunk: any, id: string, mod: any) {
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
              chunks: viewsDir ? chunk.ids : [],
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
          modId = modId.replace(/^\(sc_server\)\//, '')

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

    const file = 'server/' + MIDDLEWARE_FLIGHT_MANIFEST
    const json = JSON.stringify(manifest)

    assets[file + '.js'] = new sources.RawSource('self.__RSC_MANIFEST=' + json)
    assets[file + '.json'] = new sources.RawSource(json)
  }
}

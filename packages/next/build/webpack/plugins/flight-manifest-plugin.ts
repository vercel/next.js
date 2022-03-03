/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import { MIDDLEWARE_FLIGHT_MANIFEST } from '../../../shared/lib/constants'

// This is the module that will be used to anchor all client references to.
// I.e. it will have all the client files as async deps from this point on.
// We use the Flight client implementation because you can't get to these
// without the client runtime so it's the first time in the loading sequence
// you might want them.
// const clientFileName = require.resolve('../');

type Options = {
  dev: boolean
  clientComponentsRegex: RegExp
  runtime?: 'nodejs' | 'edge'
}

const PLUGIN_NAME = 'FlightManifestPlugin'

export class FlightManifestPlugin {
  dev: boolean = false
  runtime?: 'nodejs' | 'edge'
  clientComponentsRegex: RegExp

  constructor(options: Options) {
    if (typeof options.dev === 'boolean') {
      this.dev = options.dev
    }
    this.clientComponentsRegex = options.clientComponentsRegex
    this.runtime = options.runtime
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
    const json: any = {}
    const { clientComponentsRegex } = this
    compilation.chunkGroups.forEach((chunkGroup: any) => {
      function recordModule(id: string, _chunk: any, mod: any) {
        const resource = mod.resource?.replace(/\?__sc_client__$/, '')

        // TODO: Hook into deps instead of the target module.
        // That way we know by the type of dep whether to include.
        // It also resolves conflicts when the same module is in multiple chunks.
        const isNextClientComponent = /next[\\/](link|image)/.test(resource)
        if (!clientComponentsRegex.test(resource) && !isNextClientComponent) {
          return
        }

        const moduleExports: any = json[resource] || {}

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
        json[resource] = moduleExports
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

    const output =
      (this.runtime === 'edge' ? 'self.__RSC_MANIFEST=' : '') +
      JSON.stringify(json)
    assets[
      `server/${MIDDLEWARE_FLIGHT_MANIFEST}${
        this.runtime === 'edge' ? '.js' : '.json'
      }`
    ] = new sources.RawSource(output)
  }
}

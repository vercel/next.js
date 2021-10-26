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
}

const PLUGIN_NAME = 'FlightManifestPlugin'

export class FlightManifestPlugin {
  dev: boolean = false
  clientComponentsRegex: RegExp

  constructor(options: Options) {
    if (typeof options.dev === 'boolean') {
      this.dev = options.dev
    }
    this.clientComponentsRegex = options.clientComponentsRegex
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
        (assets: any) => this.createAsset(assets, compilation, compiler)
      )
    })
  }

  createAsset(assets: any, compilation: any, compiler: any) {
    const json: any = {}
    const { clientComponentsRegex } = this
    compilation.chunkGroups.forEach((chunkGroup: any) => {
      function recordModule(id: string, _chunk: any, mod: any) {
        const resource = mod.resource?.replace(/\?flight$/, '')

        // TODO: Hook into deps instead of the target module.
        // That way we know by the type of dep whether to include.
        // It also resolves conflicts when the same module is in multiple chunks.
        const isNextClientComponent = /next[\\/](link|image)/.test(resource)
        if (!clientComponentsRegex.test(resource) && !isNextClientComponent) {
          return
        }

        const moduleExports: any = json[resource] || {}

        const exportsInfo = compilation.moduleGraph.getExportsInfo(mod)
        const providedExports = exportsInfo.getProvidedExports()
        const moduleExportedKeys = ['', '*'].concat(
          // TODO: improve exports detection
          providedExports === true || providedExports == null
            ? 'default'
            : providedExports
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
          let modId: string

          const context = compiler.context
          const nameForCondition = mod.nameForCondition()

          if (nameForCondition && nameForCondition.startsWith(context)) {
            modId = '.' + nameForCondition.slice(context.length)
          } else {
            modId = compilation.chunkGraph.getModuleId(mod)
          }

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
      `self._middleware_rsc_manifest=(typeof _ENTRIES === "undefined"?{}:_ENTRIES)._middleware_rsc_manifest=` +
      JSON.stringify(json)
    assets[`server/${MIDDLEWARE_FLIGHT_MANIFEST}.js`] = new sources.RawSource(
      output
    )
  }
}

/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { webpack, sources } from 'next/dist/compiled/webpack/webpack'

import { REACT_FLIGHT_MANIFEST } from '../../../shared/lib/constants'

// This is the module that will be used to anchor all client references to.
// I.e. it will have all the client files as async deps from this point on.
// We use the Flight client implementation because you can't get to these
// without the client runtime so it's the first time in the loading sequence
// you might want them.
// const clientFileName = require.resolve('../');

type ClientReferenceSearchPath = {
  directory: string
  recursive?: boolean
  include: RegExp
  exclude?: RegExp
}

type ClientReferencePath = string | ClientReferenceSearchPath

type Options = {
  isServer: boolean
  chunkName?: string
  dev: boolean
}

const PLUGIN_NAME = 'NextJsFlightManifest'

export class ReactFlightManifestPlugin {
  clientReferences: Readonly<ClientReferencePath[]>
  chunkName: string
  dev: boolean

  constructor(options: Options) {
    if (!options || typeof options.isServer !== 'boolean') {
      throw new Error(
        PLUGIN_NAME + ': You must specify the isServer option as a boolean.'
      )
    }
    if (options.isServer) {
      throw new Error('TODO: Implement the server compiler.')
    }

    this.clientReferences = [
      {
        directory: '.',
        recursive: true,
        include: /\.client\.(js|ts|jsx|tsx)$/,
      },
    ]

    if (typeof options.chunkName === 'string') {
      this.chunkName = options.chunkName
    } else {
      this.chunkName = 'client'
    }

    this.dev = options.dev
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
        (assets: any) => {
          const json: any = {}
          compilation.chunkGroups.forEach((chunkGroup: any) => {
            function recordModule(chunk: any, mod: any) {
              // TODO: Hook into deps instead of the target module.
              // That way we know by the type of dep whether to include.
              // It also resolves conflicts when the same module is in multiple chunks.
              if (!/\.client\.(js|ts)x?$/.test(mod.resource)) {
                return
              }
              const moduleExports: any = {}

              ;['', '*']
                .concat(
                  compilation.moduleGraph
                    .getExportsInfo(mod)
                    .getProvidedExports()
                )
                .forEach((name) => {
                  moduleExports[name] = {
                    id: compilation.chunkGraph.getModuleId(mod),
                    chunks: chunk.ids,
                    name: name,
                  }
                })
              json[mod.resource] = moduleExports
            }

            chunkGroup.chunks.forEach((chunk: any) => {
              const chunkModules =
                compilation.chunkGraph.getChunkModulesIterable(chunk)
              for (const mod of chunkModules) {
                recordModule(chunk, mod)
                // If this is a concatenation, register each child to the parent ID.
                if (mod.modules) {
                  mod.modules.forEach((concatenatedMod: any) => {
                    recordModule(chunk, concatenatedMod)
                  })
                }
              }
            })
          })
          const output = JSON.stringify(json, null, 2)
          assets[REACT_FLIGHT_MANIFEST] = new sources.RawSource(output)
        }
      )
    })
  }
}

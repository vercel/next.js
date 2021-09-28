/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { join } from 'path'
import { resolve } from 'url'

import asyncLib from 'neo-async'
import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
const { ModuleDependency, NullDependency } = (webpack as any).dependencies

import { REACT_FLIGHT_MANIFEST } from '../../../shared/lib/constants'

class ClientReferenceDependency extends (ModuleDependency as any) {
  userRequest: any
  constructor(request: any) {
    super(request)
  }

  get type() {
    return 'client-reference'
  }
}

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
    let resolvedClientReferences: any
    const run = (params: any, callback: any) => {
      // First we need to find all client files on the file system. We do this early so
      // that we have them synchronously available later when we need them. This might
      // not be needed anymore since we no longer need to compile the module itself in
      // a special way. So it's probably better to do this lazily and in parallel with
      // other compilation.
      const contextResolver = compiler.resolverFactory.get('context', {})
      this.resolveAllClientFiles(
        compiler.context,
        contextResolver,
        compiler.inputFileSystem,
        compiler.createContextModuleFactory(),
        (err, resolvedClientRefs) => {
          if (err) {
            callback(err)
            return
          }
          resolvedClientReferences = resolvedClientRefs
          callback()
        }
      )
    }

    compiler.hooks.run.tapAsync(PLUGIN_NAME, run)
    compiler.hooks.watchRun.tapAsync(PLUGIN_NAME, run)
    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation: any, { normalModuleFactory }: any) => {
        compilation.dependencyFactories.set(
          ClientReferenceDependency,
          normalModuleFactory
        )
        compilation.dependencyTemplates.set(
          ClientReferenceDependency,
          new NullDependency.Template()
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

          const pagesManifestPath =
            `${!this.dev ? '../' : ''}` + REACT_FLIGHT_MANIFEST
          assets[pagesManifestPath] = new sources.RawSource(output)
        }
      )
    })
  }

  // This attempts to replicate the dynamic file path resolution used for other wildcard
  // resolution in Webpack is using.
  resolveAllClientFiles(
    context: string,
    contextResolver: any,
    fs: any,
    contextModuleFactory: any,
    callback: (
      err: null | Error,
      result?: Readonly<ClientReferenceDependency[]>
    ) => void
  ) {
    asyncLib.map(
      this.clientReferences,
      (
        clientReferencePath: string | ClientReferenceSearchPath,
        cb: (
          err: null | Error,
          result?: Readonly<ClientReferenceDependency[]>
        ) => void
      ): void => {
        if (typeof clientReferencePath === 'string') {
          cb(null, [new ClientReferenceDependency(clientReferencePath)])
          return
        }
        const clientReferenceSearch: ClientReferenceSearchPath =
          clientReferencePath
        contextResolver.resolve(
          {},
          context,
          clientReferencePath.directory,
          {},
          (err: any, resolvedDirectory: any) => {
            if (err) return cb(err)
            const options = {
              resource: resolvedDirectory,
              resourceFragment: '',
              resourceQuery: '',
              recursive:
                clientReferenceSearch.recursive === undefined
                  ? true
                  : clientReferenceSearch.recursive,
              regExp: clientReferenceSearch.include,
              include: undefined,
              exclude: clientReferenceSearch.exclude,
            }
            contextModuleFactory.resolveDependencies(
              fs,
              options,
              (err2: null | Error, deps: any[]) => {
                if (err2) return cb(err2)
                const clientRefDeps = deps.map((dep) => {
                  const request = join(resolvedDirectory, dep.request)
                  const clientRefDep = new ClientReferenceDependency(request)
                  clientRefDep.userRequest = dep.userRequest
                  return clientRefDep
                })
                cb(null, clientRefDeps)
              }
            )
          }
        )
      },
      (
        err: null | Error,
        result: Readonly<Readonly<ClientReferenceDependency[]>[]>
      ): void => {
        if (err) return callback(err)
        const flat: any = []
        for (let i = 0; i < result.length; i++) {
          flat.push.apply(flat, result[i])
        }
        callback(null, flat)
      }
    )
  }
}

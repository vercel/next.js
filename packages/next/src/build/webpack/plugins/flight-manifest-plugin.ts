/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from 'path'
import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import {
  CLIENT_REFERENCE_MANIFEST,
  SYSTEM_ENTRYPOINTS,
} from '../../../shared/lib/constants'
import { relative, sep } from 'path'
import { isClientComponentEntryModule, isCSSMod } from '../loaders/utils'
import { getProxiedPluginState } from '../../build-context'

import { traverseModules } from '../utils'
import { nonNullable } from '../../../lib/non-nullable'
import { WEBPACK_LAYERS } from '../../../lib/constants'
import { getClientReferenceModuleKey } from '../../../lib/client-reference'

interface Options {
  dev: boolean
  appDir: string
}

/**
 * Webpack module id
 */
// TODO-APP ensure `null` is included as it is used.
type ModuleId = string | number /*| null*/

export type ManifestChunks = Array<`${string}:${string}` | string>

const pluginState = getProxiedPluginState({
  serverModuleIds: {} as Record<string, string | number>,
  edgeServerModuleIds: {} as Record<string, string | number>,
  ASYNC_CLIENT_MODULES: [] as string[],
})

export interface ManifestNode {
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

type ChunkLoading = {
  prefix: string
  crossOrigin: string | null
}
export type ClientReferenceManifest = {
  chunkLoading: ChunkLoading
  clientModules: ManifestNode
  ssrModuleMapping: {
    [moduleId: string]: ManifestNode
  }
  edgeSSRModuleMapping: {
    [moduleId: string]: ManifestNode
  }
  cssFiles: {
    [entryPathWithoutExtension: string]: string[]
  }
}

export type ClientCSSReferenceManifest = {
  cssImports: {
    [modulePath: string]: string[]
  }
  cssModules?: {
    [entry: string]: string[]
  }
}

const PLUGIN_NAME = 'ClientReferenceManifestPlugin'

export class ClientReferenceManifestPlugin {
  dev: Options['dev'] = false
  appDir: Options['appDir']
  ASYNC_CLIENT_MODULES: Set<string>

  constructor(options: Options) {
    this.dev = options.dev
    this.appDir = options.appDir
    this.ASYNC_CLIENT_MODULES = new Set(pluginState.ASYNC_CLIENT_MODULES)
  }

  apply(compiler: webpack.Compiler) {
    const DefinePlugin = webpack.DefinePlugin

    const configuredCrossOriginLoading =
      compiler.options.output.crossOriginLoading
    const crossOriginMode =
      typeof configuredCrossOriginLoading === 'string'
        ? configuredCrossOriginLoading === 'use-credentials'
          ? configuredCrossOriginLoading
          : 'anonymous'
        : null

    const definePlugin = new DefinePlugin({
      __WEBPACK_FLIGHT_CROSS_ORIGIN_CREDENTIALS__:
        crossOriginMode === 'use-credentials' ? 'true' : 'false',
      __WEBPACK_FLIGHT_CROSS_ORIGIN_ANONYMOUS__:
        crossOriginMode === 'anonymous' ? 'true' : 'false',
    })
    definePlugin.apply(compiler)

    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation, { normalModuleFactory }) => {
        compilation.dependencyFactories.set(
          webpack.dependencies.ModuleDependency,
          normalModuleFactory
        )
        compilation.dependencyTemplates.set(
          webpack.dependencies.ModuleDependency,
          new webpack.dependencies.NullDependency.Template()
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
        (assets) =>
          this.createAsset(
            assets,
            compilation,
            compiler.context,
            crossOriginMode
          )
      )
    })
  }

  createAsset(
    assets: webpack.Compilation['assets'],
    compilation: webpack.Compilation,
    context: string,
    crossOriginLoading: string | null
  ) {
    if (typeof compilation.outputOptions.publicPath === 'function') {
      throw new Error(
        'Next.js expected the webpack publicPath to be a string but a function was found instead.'
      )
    }
    const prefix = compilation.outputOptions.publicPath || ''

    const manifest: ClientReferenceManifest = {
      chunkLoading: {
        prefix,
        crossOrigin: crossOriginLoading,
      },
      ssrModuleMapping: {},
      edgeSSRModuleMapping: {},
      cssFiles: {},
      clientModules: {},
    }

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

    let runtimeChunkFiles = new Set()
    compilation.entrypoints.forEach((entrypoint) => {
      const runtimeChunk = entrypoint.getRuntimeChunk()
      if (runtimeChunk) {
        runtimeChunk.files.forEach((runtimeChunkFile) => {
          if (!runtimeChunkFile.endsWith('.js')) return null
          runtimeChunkFiles.add(runtimeChunkFile)
        })
      }
    })

    console.log('runtimeChunkFiles', runtimeChunkFiles)

    compilation.chunkGroups.forEach((chunkGroup) => {
      console.log('chunkGroup', chunkGroup.name)

      let requiredChunks: null | string[] = null

      const recordModule = (
        id: ModuleId,
        mod: webpack.NormalModule,
        chunkCSS: string[]
      ) => {
        const isCSSModule = isCSSMod(mod)

        // Skip all modules from the pages folder. CSS modules are a special case
        // as they are generated by mini-css-extract-plugin and these modules
        // don't have layer information attached.
        if (!isCSSModule && mod.layer !== WEBPACK_LAYERS.appClient) {
          return
        }

        const resource =
          mod.type === 'css/mini-extract'
            ? // @ts-expect-error TODO: use `identifier()` instead.
              mod._identifier.slice(mod._identifier.lastIndexOf('!') + 1)
            : mod.resource

        if (!resource) {
          return
        }

        const moduleReferences = manifest.clientModules
        const moduleIdMapping = manifest.ssrModuleMapping
        const edgeModuleIdMapping = manifest.edgeSSRModuleMapping

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
          const exportName = getClientReferenceModuleKey(resource, '')
          if (!moduleReferences[exportName]) {
            moduleReferences[exportName] = {
              id: id || '',
              name: 'default',
              chunks: chunkCSS,
            }
          } else {
            // It is possible that there are multiple modules with the same resource,
            // e.g. extracted by mini-css-extract-plugin. In that case we need to
            // merge the chunks.
            moduleReferences[exportName].chunks = [
              ...new Set([...moduleReferences[exportName].chunks, ...chunkCSS]),
            ]
          }

          return
        }

        // Only apply following logic to client module requests from client entry,
        // or if the module is marked as client module.
        if (
          !clientRequestsSet.has(resource) &&
          !isClientComponentEntryModule(mod)
        ) {
          return
        }

        const exportsInfo = compilation.moduleGraph.getExportsInfo(mod)
        const isAsyncModule = this.ASYNC_CLIENT_MODULES.has(mod.resource)

        const cjsExports = [
          ...new Set(
            [
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
                    return dep.names.filter(
                      (name: any) => name !== '__esModule'
                    )
                  }
                }
                return null
              }),
              ...(mod.buildInfo.rsc?.clientRefs || []),
            ]
              .filter(Boolean)
              .flat()
          ),
        ]

        // We only need to compute required chunks for a chunk group once. We do it here
        // lazily if we end up register modules within this chunk group.
        let chunks: string[]
        if (requiredChunks) {
          chunks = requiredChunks
        } else {
          chunks = requiredChunks = []
          chunkGroup.chunks.forEach((requiredChunk: webpack.Chunk) => {
            console.log('chunk', requiredChunk.name)
            if (SYSTEM_ENTRYPOINTS.has(requiredChunk.name)) {
              return null
            }

            // Get the actual chunk file names from the chunk file list.
            // It's possible that the chunk is generated via `import()`, in
            // that case the chunk file name will be '[name].[contenthash]'
            // instead of '[name]-[chunkhash]'.
            requiredChunk.files.forEach((file) => {
              console.log('file', file)
              // It's possible that a chunk also emits CSS files, that will
              // be handled separatedly.
              if (!file.endsWith('.js')) return
              if (runtimeChunkFiles.has(file)) return
              if (file.endsWith('.hot-update.js')) return

              chunks.push(file)
            })
          })
        }

        // The client compiler will always use the CJS Next.js build, so here we
        // also add the mapping for the ESM build (Edge runtime) to consume.
        const esmResource = /[\\/]next[\\/]dist[\\/]/.test(resource)
          ? resource.replace(
              /[\\/]next[\\/]dist[\\/]/,
              '/next/dist/esm/'.replace(/\//g, path.sep)
            )
          : null

        function addClientReference(name: string) {
          const exportName = getClientReferenceModuleKey(resource, name)
          manifest.clientModules[exportName] = {
            id,
            name,
            chunks,
            async: isAsyncModule,
          }
          if (esmResource) {
            const edgeExportName = getClientReferenceModuleKey(
              esmResource,
              name
            )
            manifest.clientModules[edgeExportName] =
              manifest.clientModules[exportName]
          }
        }

        function addSSRIdMapping(name: string) {
          const exportName = getClientReferenceModuleKey(resource, name)
          if (
            typeof pluginState.serverModuleIds[ssrNamedModuleId] !== 'undefined'
          ) {
            moduleIdMapping[id] = moduleIdMapping[id] || {}
            moduleIdMapping[id][name] = {
              ...manifest.clientModules[exportName],
              id: pluginState.serverModuleIds[ssrNamedModuleId],
            }
          }

          if (
            typeof pluginState.edgeServerModuleIds[ssrNamedModuleId] !==
            'undefined'
          ) {
            edgeModuleIdMapping[id] = edgeModuleIdMapping[id] || {}
            edgeModuleIdMapping[id][name] = {
              ...manifest.clientModules[exportName],
              id: pluginState.edgeServerModuleIds[ssrNamedModuleId],
            }
          }
        }

        addClientReference('*')
        addClientReference('')
        addSSRIdMapping('*')
        addSSRIdMapping('')

        const moduleExportedKeys = [
          ...[...exportsInfo.exports]
            .filter((exportInfo) => exportInfo.provided)
            .map((exportInfo) => exportInfo.name),
          ...cjsExports,
        ].filter((name) => name !== null)

        moduleExportedKeys.forEach((name) => {
          const key = resource + '#' + name

          // If the chunk is from `app/` chunkGroup, use it first.
          // This make sure not to load the overlapped chunk from `pages/` chunkGroup
          if (
            !manifest.clientModules[key] ||
            (chunkGroup.name && /^app[\\/]/.test(chunkGroup.name))
          ) {
            addClientReference(name)
          }

          addSSRIdMapping(name)
        })

        manifest.clientModules = moduleReferences
        manifest.ssrModuleMapping = moduleIdMapping
        manifest.edgeSSRModuleMapping = edgeModuleIdMapping
      }

      chunkGroup.chunks.forEach((chunk: webpack.Chunk) => {
        const chunkModules = compilation.chunkGraph.getChunkModulesIterable(
          chunk
          // TODO: Update type so that it doesn't have to be cast.
        ) as Iterable<webpack.NormalModule>

        const chunkCSS = [...chunk.files].filter(
          (f) => !f.startsWith('static/css/pages/') && f.endsWith('.css')
        )

        for (const mod of chunkModules) {
          const modId: string = compilation.chunkGraph.getModuleId(mod) + ''

          recordModule(modId, mod, chunkCSS)

          // If this is a concatenation, register each child to the parent ID.
          // TODO: remove any
          const anyModule = mod as any
          if (anyModule.modules) {
            anyModule.modules.forEach((concatenatedMod: any) => {
              recordModule(modId, concatenatedMod, chunkCSS)
            })
          }
        }
      })

      const entryCSSFiles: { [key: string]: string[] } = manifest.cssFiles || {}

      const addCSSFilesToEntry = (
        files: string[],
        entryName: string | undefined | null
      ) => {
        if (entryName?.startsWith('app/')) {
          // The `key` here should be the absolute file path but without extension.
          // We need to replace the separator in the entry name to match the system separator.
          const key =
            this.appDir +
            entryName
              .slice(3)
              .replace(/\//g, sep)
              .replace(/\.[^\\/.]+$/, '')
          entryCSSFiles[key] = files.concat(entryCSSFiles[key] || [])
        }
      }

      const cssFiles = chunkGroup.getFiles().filter((f) => f.endsWith('.css'))

      if (cssFiles.length) {
        // Add to chunk entry and parent chunk groups too.
        addCSSFilesToEntry(cssFiles, chunkGroup.name)
        chunkGroup.getParents().forEach((parent) => {
          addCSSFilesToEntry(cssFiles, parent.options.name)
        })
      }

      manifest.cssFiles = entryCSSFiles
    })

    const file = 'server/' + CLIENT_REFERENCE_MANIFEST
    const json = JSON.stringify(manifest, null, this.dev ? 2 : undefined)

    pluginState.ASYNC_CLIENT_MODULES = []

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

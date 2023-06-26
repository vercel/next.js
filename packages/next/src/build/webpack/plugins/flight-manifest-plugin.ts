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
import { relative } from 'path'
import { isClientComponentEntryModule, isCSSMod } from '../loaders/utils'
import { getProxiedPluginState } from '../../build-context'

import { traverseModules } from '../utils'
import { nonNullable } from '../../../lib/non-nullable'
import { WEBPACK_LAYERS } from '../../../lib/constants'

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

export type ClientReferenceManifest = {
  clientModules: ManifestNode
  ssrModuleMapping: {
    [moduleId: string]: ManifestNode
  }
  edgeSSRModuleMapping: {
    [moduleId: string]: ManifestNode
  }
  entryCSSFiles: {
    [entry: string]: {
      files: string[]
    }
  }
}

const PLUGIN_NAME = 'ClientReferenceManifestPlugin'

export class ClientReferenceManifestPlugin {
  dev: Options['dev'] = false
  appDir: Options['appDir']
  appDirBase: string
  ASYNC_CLIENT_MODULES: Set<string>

  constructor(options: Options) {
    this.dev = options.dev
    this.appDir = options.appDir
    this.appDirBase = path.dirname(this.appDir) + path.sep
    this.ASYNC_CLIENT_MODULES = new Set(pluginState.ASYNC_CLIENT_MODULES)
  }

  apply(compiler: webpack.Compiler) {
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
        (assets) => this.createAsset(assets, compilation, compiler.context)
      )
    })
  }

  createAsset(
    assets: webpack.Compilation['assets'],
    compilation: webpack.Compilation,
    context: string
  ) {
    const manifest: ClientReferenceManifest = {
      ssrModuleMapping: {},
      edgeSSRModuleMapping: {},
      clientModules: {},
      entryCSSFiles: {},
    }

    const clientRequestsSet = new Set()

    // Collect client requests
    function collectClientRequest(mod: webpack.NormalModule) {
      if (mod.resource === '' && mod.buildInfo?.rsc) {
        const { requests = [] } = mod.buildInfo.rsc
        requests.forEach((r: string) => {
          clientRequestsSet.add(r)
        })
      }
    }

    traverseModules(compilation, (mod) => collectClientRequest(mod))

    compilation.chunkGroups.forEach((chunkGroup) => {
      function getAppPathRequiredChunks() {
        return chunkGroup.chunks
          .map((requiredChunk: webpack.Chunk) => {
            if (SYSTEM_ENTRYPOINTS.has(requiredChunk.name || '')) {
              return null
            }

            // Get the actual chunk file names from the chunk file list.
            // It's possible that the chunk is generated via `import()`, in
            // that case the chunk file name will be '[name].[contenthash]'
            // instead of '[name]-[chunkhash]'.
            return [...requiredChunk.files].map((file) => {
              // It's possible that a chunk also emits CSS files, that will
              // be handled separatedly.
              if (!file.endsWith('.js')) return null
              if (file.endsWith('.hot-update.js')) return null

              return requiredChunk.id + ':' + file
            })
          })
          .flat()
          .filter(nonNullable)
      }
      const requiredChunks = getAppPathRequiredChunks()

      let chunkEntryName: string | null = null
      if (chunkGroup.name && /^app[\\/]/.test(chunkGroup.name)) {
        // Absolute path without the extension
        chunkEntryName = (this.appDirBase + chunkGroup.name).replace(
          /[\\/]/g,
          path.sep
        )
        manifest.entryCSSFiles[chunkEntryName] = {
          files: chunkGroup
            .getFiles()
            .filter(
              (f) => !f.startsWith('static/css/pages/') && f.endsWith('.css')
            ),
        }
      }

      const recordModule = (id: ModuleId, mod: webpack.NormalModule) => {
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

        if (isCSSModule) {
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

        // Only apply following logic to client module requests from client entry,
        // or if the module is marked as client module.
        if (
          !clientRequestsSet.has(resource) &&
          !isClientComponentEntryModule(mod)
        ) {
          return
        }

        const isAsyncModule = this.ASYNC_CLIENT_MODULES.has(mod.resource)

        // The client compiler will always use the CJS Next.js build, so here we
        // also add the mapping for the ESM build (Edge runtime) to consume.
        const esmResource = /[\\/]next[\\/]dist[\\/]/.test(resource)
          ? resource.replace(
              /[\\/]next[\\/]dist[\\/]/,
              '/next/dist/esm/'.replace(/\//g, path.sep)
            )
          : null

        function addClientReference() {
          const exportName = resource
          manifest.clientModules[exportName] = {
            id,
            name: '*',
            chunks: requiredChunks,
            async: isAsyncModule,
          }
          if (esmResource) {
            const edgeExportName = esmResource
            manifest.clientModules[edgeExportName] =
              manifest.clientModules[exportName]
          }
        }

        function addSSRIdMapping() {
          const exportName = resource
          if (
            typeof pluginState.serverModuleIds[ssrNamedModuleId] !== 'undefined'
          ) {
            moduleIdMapping[id] = moduleIdMapping[id] || {}
            moduleIdMapping[id]['*'] = {
              ...manifest.clientModules[exportName],
              // During SSR, we don't have external chunks to load on the server
              // side with our architecture of Webpack / Turbopack. We can keep
              // this field empty to save some bytes.
              chunks: [],
              id: pluginState.serverModuleIds[ssrNamedModuleId],
            }
          }

          if (
            typeof pluginState.edgeServerModuleIds[ssrNamedModuleId] !==
            'undefined'
          ) {
            edgeModuleIdMapping[id] = edgeModuleIdMapping[id] || {}
            edgeModuleIdMapping[id]['*'] = {
              ...manifest.clientModules[exportName],
              // During SSR, we don't have external chunks to load on the server
              // side with our architecture of Webpack / Turbopack. We can keep
              // this field empty to save some bytes.
              chunks: [],
              id: pluginState.edgeServerModuleIds[ssrNamedModuleId],
            }
          }
        }

        addClientReference()
        addSSRIdMapping()

        manifest.clientModules = moduleReferences
        manifest.ssrModuleMapping = moduleIdMapping
        manifest.edgeSSRModuleMapping = edgeModuleIdMapping
      }

      chunkGroup.chunks.forEach((chunk: webpack.Chunk) => {
        const chunkModules = compilation.chunkGraph.getChunkModulesIterable(
          chunk
          // TODO: Update type so that it doesn't have to be cast.
        ) as Iterable<webpack.NormalModule>

        for (const mod of chunkModules) {
          const modId: string = compilation.chunkGraph.getModuleId(mod) + ''

          recordModule(modId, mod)

          // If this is a concatenation, register each child to the parent ID.
          // TODO: remove any
          const anyModule = mod as any
          if (anyModule.modules) {
            anyModule.modules.forEach((concatenatedMod: any) => {
              recordModule(modId, concatenatedMod)
            })
          }
        }
      })
    })

    const file = 'server/' + CLIENT_REFERENCE_MANIFEST
    const json = JSON.stringify(manifest, null, this.dev ? 2 : undefined)

    pluginState.ASYNC_CLIENT_MODULES = []

    assets[file + '.js'] = new sources.RawSource(
      `self.__RSC_MANIFEST=${JSON.stringify(json)}`
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

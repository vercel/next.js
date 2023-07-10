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
import { getProxiedPluginState } from '../../build-context'

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
    [entry: string]: string[]
  }
}

function getAppPathRequiredChunks(chunkGroup: webpack.ChunkGroup) {
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

function mergeManifest(
  manifest: ClientReferenceManifest,
  manifestToMerge: ClientReferenceManifest
) {
  Object.assign(manifest.clientModules, manifestToMerge.clientModules)
  Object.assign(manifest.ssrModuleMapping, manifestToMerge.ssrModuleMapping)
  Object.assign(
    manifest.edgeSSRModuleMapping,
    manifestToMerge.edgeSSRModuleMapping
  )
  Object.assign(manifest.entryCSSFiles, manifestToMerge.entryCSSFiles)
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
        compilation.hooks.processAssets.tap(
          {
            name: PLUGIN_NAME,
            // Have to be in the optimize stage to run after updating the CSS
            // asset hash via extract mini css plugin.
            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
          },
          (assets) => this.createAsset(assets, compilation, compiler.context)
        )
      }
    )
  }

  createAsset(
    assets: webpack.Compilation['assets'],
    compilation: webpack.Compilation,
    context: string
  ) {
    const manifestsPerGroup = new Map<string, ClientReferenceManifest[]>()

    compilation.chunkGroups.forEach((chunkGroup) => {
      // By default it's the shared chunkGroup (main-app) for every page.
      let entryName = ''
      const manifest: ClientReferenceManifest = {
        ssrModuleMapping: {},
        edgeSSRModuleMapping: {},
        clientModules: {},
        entryCSSFiles: {},
      }

      if (chunkGroup.name && /^app[\\/]/.test(chunkGroup.name)) {
        // Absolute path without the extension
        const chunkEntryName = (this.appDirBase + chunkGroup.name).replace(
          /[\\/]/g,
          path.sep
        )
        manifest.entryCSSFiles[chunkEntryName] = chunkGroup
          .getFiles()
          .filter(
            (f) => !f.startsWith('static/css/pages/') && f.endsWith('.css')
          )

        entryName = chunkGroup.name
      }

      const requiredChunks = getAppPathRequiredChunks(chunkGroup)
      const recordModule = (id: ModuleId, mod: webpack.NormalModule) => {
        // Skip all modules from the pages folder.
        if (mod.layer !== WEBPACK_LAYERS.appClient) {
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

      // Only apply following logic to client module requests from client entry,
      // or if the module is marked as client module. That's because other
      // client modules don't need to be in the manifest at all as they're
      // never be referenced by the server/client boundary.
      // This saves a lot of bytes in the manifest.
      chunkGroup.chunks.forEach((chunk: webpack.Chunk) => {
        const entryMods =
          compilation.chunkGraph.getChunkEntryModulesIterable(chunk)
        for (const mod of entryMods) {
          if (mod.layer !== WEBPACK_LAYERS.appClient) continue

          const request = (mod as webpack.NormalModule).request

          if (
            !request ||
            !request.includes('next-flight-client-entry-loader.js?')
          ) {
            continue
          }

          const connections =
            compilation.moduleGraph.getOutgoingConnections(mod)

          for (const connection of connections) {
            const dependency = connection.dependency
            if (!dependency) continue

            const clientEntryMod = compilation.moduleGraph.getResolvedModule(
              dependency
            ) as webpack.NormalModule
            const modId = compilation.chunkGraph.getModuleId(clientEntryMod) as
              | string
              | number
              | null

            if (modId !== null) {
              recordModule(modId, clientEntryMod)
            } else {
              // If this is a concatenation, register each child to the parent ID.
              if (
                connection.module?.constructor.name === 'ConcatenatedModule'
              ) {
                const concatenatedMod = connection.module
                const concatenatedModId =
                  compilation.chunkGraph.getModuleId(concatenatedMod)
                recordModule(concatenatedModId, clientEntryMod)
              }
            }
          }
        }
      })

      // A page's entry name can have extensions. For example, these are both valid:
      // - app/foo/page
      // - app/foo/page.page
      // Let's normalize the entry name to remove the extra extension
      const groupName = /\/page(\.[^/]+)?$/.test(entryName)
        ? entryName.replace(/\/page(\.[^/]+)?$/, '/page')
        : entryName.slice(0, entryName.lastIndexOf('/'))

      if (!manifestsPerGroup.has(groupName)) {
        manifestsPerGroup.set(groupName, [])
      }
      manifestsPerGroup.get(groupName)!.push(manifest)

      if (entryName.includes('/@')) {
        // Remove parallel route labels:
        // - app/foo/@bar/page -> app/foo
        // - app/foo/@bar/layout -> app/foo/layout -> app/foo
        const entryNameWithoutNamedSegments = entryName.replace(/\/@[^/]+/g, '')
        const groupNameWithoutNamedSegments =
          entryNameWithoutNamedSegments.slice(
            0,
            entryNameWithoutNamedSegments.lastIndexOf('/')
          )
        if (!manifestsPerGroup.has(groupNameWithoutNamedSegments)) {
          manifestsPerGroup.set(groupNameWithoutNamedSegments, [])
        }
        manifestsPerGroup.get(groupNameWithoutNamedSegments)!.push(manifest)
      }

      // Special case for the root not-found page.
      if (/^app\/not-found(\.[^.]+)?$/.test(entryName)) {
        if (!manifestsPerGroup.has('app/not-found')) {
          manifestsPerGroup.set('app/not-found', [])
        }
        manifestsPerGroup.get('app/not-found')!.push(manifest)
      }
    })

    // Generate per-page manifests.
    for (const [groupName] of manifestsPerGroup) {
      if (groupName.endsWith('/page') || groupName === 'app/not-found') {
        const mergedManifest: ClientReferenceManifest = {
          ssrModuleMapping: {},
          edgeSSRModuleMapping: {},
          clientModules: {},
          entryCSSFiles: {},
        }

        const segments = groupName.split('/')
        let group = ''
        for (const segment of segments) {
          if (segment.startsWith('@')) continue
          for (const manifest of manifestsPerGroup.get(group) || []) {
            mergeManifest(mergedManifest, manifest)
          }
          group += (group ? '/' : '') + segment
        }
        for (const manifest of manifestsPerGroup.get(groupName) || []) {
          mergeManifest(mergedManifest, manifest)
        }

        const json = JSON.stringify(mergedManifest)

        const pagePath = groupName.replace(/%5F/g, '_')
        assets['server/' + pagePath + '_' + CLIENT_REFERENCE_MANIFEST + '.js'] =
          new sources.RawSource(
            `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[${JSON.stringify(
              pagePath.slice('app'.length)
            )}]=${JSON.stringify(json)}`
          ) as unknown as webpack.sources.RawSource

        if (pagePath === 'app/not-found') {
          // Create a separate special manifest for the root not-found page.
          assets[
            'server/' +
              'app/_not-found' +
              '_' +
              CLIENT_REFERENCE_MANIFEST +
              '.js'
          ] = new sources.RawSource(
            `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[${JSON.stringify(
              '/_not-found'
            )}]=${JSON.stringify(json)}`
          ) as unknown as webpack.sources.RawSource
        }
      }
    }

    pluginState.ASYNC_CLIENT_MODULES = []
  }
}

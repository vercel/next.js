/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from 'path'
import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import {
  BARREL_OPTIMIZATION_PREFIX,
  CLIENT_REFERENCE_MANIFEST,
  SYSTEM_ENTRYPOINTS,
} from '../../../shared/lib/constants'
import { relative } from 'path'
import { getProxiedPluginState } from '../../build-context'

import { WEBPACK_LAYERS } from '../../../lib/constants'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import { CLIENT_STATIC_FILES_RUNTIME_MAIN_APP } from '../../../shared/lib/constants'
import { getDeploymentIdQueryOrEmptyString } from '../../deployment-id'
import { formatBarrelOptimizedResource } from '../utils'

interface Options {
  dev: boolean
  appDir: string
}

/**
 * Webpack module id
 */
// TODO-APP ensure `null` is included as it is used.
type ModuleId = string | number /*| null*/

// double indexed chunkId, filename
export type ManifestChunks = Array<string>

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
  moduleLoading: {
    prefix: string
    crossOrigin: string | null
  }
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
  entryJSFiles?: {
    [entry: string]: string[]
  }
}

function getAppPathRequiredChunks(
  chunkGroup: webpack.ChunkGroup,
  excludedFiles: Set<string>
) {
  const deploymentIdChunkQuery = getDeploymentIdQueryOrEmptyString()

  const chunks: Array<string> = []
  chunkGroup.chunks.forEach((chunk) => {
    if (SYSTEM_ENTRYPOINTS.has(chunk.name || '')) {
      return null
    }

    // Get the actual chunk file names from the chunk file list.
    // It's possible that the chunk is generated via `import()`, in
    // that case the chunk file name will be '[name].[contenthash]'
    // instead of '[name]-[chunkhash]'.
    if (chunk.id != null) {
      const chunkId = '' + chunk.id
      chunk.files.forEach((file) => {
        // It's possible that a chunk also emits CSS files, that will
        // be handled separatedly.
        if (!file.endsWith('.js')) return null
        if (file.endsWith('.hot-update.js')) return null
        if (excludedFiles.has(file)) return null

        // We encode the file as a URI because our server (and many other services such as S3)
        // expect to receive reserved characters such as `[` and `]` as encoded. This was
        // previously done for dynamic chunks by patching the webpack runtime but we want
        // these filenames to be managed by React's Flight runtime instead and so we need
        // to implement any special handling of the file name here.
        return chunks.push(chunkId, encodeURI(file + deploymentIdChunkQuery))
      })
    }
  })
  return chunks
}

// Normalize the entry names to their "group names" so a page can easily track
// all the manifest items it needs from parent groups by looking up the group
// segments:
// - app/foo/loading -> app/foo
// - app/foo/page -> app/foo
// - app/(group)/@named/foo/page -> app/foo
// - app/(.)foo/(..)bar/loading -> app/bar
// - app/[...catchAll]/page -> app
// - app/foo/@slot/[...catchAll]/page -> app/foo
function entryNameToGroupName(entryName: string) {
  let groupName = entryName
    .slice(0, entryName.lastIndexOf('/'))
    // Remove slots
    .replace(/\/@[^/]+/g, '')
    // Remove the group with lookahead to make sure it's not interception route
    .replace(/\/\([^/]+\)(?=(\/|$))/g, '')
    // Remove catch-all routes since they should be part of the parent group that the catch-all would apply to.
    // This is necessary to support parallel routes since multiple page components can be rendered on the same page.
    // In order to do that, we need to ensure that the manifests are merged together by putting them in the same group.
    .replace(/\/\[?\[\.\.\.[^\]]*\]\]?/g, '')

  // Interception routes
  groupName = groupName
    .replace(/^.+\/\(\.\.\.\)/g, 'app/')
    .replace(/\/\(\.\)/g, '/')

  // Interception routes (recursive)
  while (/\/[^/]+\/\(\.\.\)/.test(groupName)) {
    groupName = groupName.replace(/\/[^/]+\/\(\.\.\)/g, '/')
  }

  return groupName
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
    const manifestEntryFiles: string[] = []

    const configuredCrossOriginLoading =
      compilation.outputOptions.crossOriginLoading
    const crossOriginMode =
      typeof configuredCrossOriginLoading === 'string'
        ? configuredCrossOriginLoading === 'use-credentials'
          ? configuredCrossOriginLoading
          : 'anonymous'
        : null

    if (typeof compilation.outputOptions.publicPath !== 'string') {
      throw new Error(
        'Expected webpack publicPath to be a string when using App Router. To customize where static assets are loaded from, use the `assetPrefix` option in next.config.js. If you are customizing your webpack config please make sure you are not modifying or removing the publicPath configuration option'
      )
    }
    const prefix = compilation.outputOptions.publicPath || ''

    // We want to omit any files that will always be loaded on any App Router page
    // because they will already be loaded by the main entrypoint.
    const rootMainFiles: Set<string> = new Set()
    compilation.entrypoints
      .get(CLIENT_STATIC_FILES_RUNTIME_MAIN_APP)
      ?.getFiles()
      .forEach((file) => {
        if (/(?<!\.hot-update)\.(js|css)($|\?)/.test(file)) {
          rootMainFiles.add(file.replace(/\\/g, '/'))
        }
      })

    compilation.chunkGroups.forEach((chunkGroup) => {
      // By default it's the shared chunkGroup (main-app) for every page.
      let entryName = ''
      const manifest: ClientReferenceManifest = {
        moduleLoading: {
          prefix,
          crossOrigin: crossOriginMode,
        },
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

      const requiredChunks = getAppPathRequiredChunks(chunkGroup, rootMainFiles)
      const recordModule = (id: ModuleId, mod: webpack.NormalModule) => {
        // Skip all modules from the pages folder.
        if (mod.layer !== WEBPACK_LAYERS.appPagesBrowser) {
          return
        }

        let resource =
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

        // An extra query param is added to the resource key when it's optimized
        // through the Barrel Loader. That's because the same file might be created
        // as multiple modules (depending on what you import from it).
        // See also: webpack/loaders/next-flight-loader/index.ts.
        if (mod.matchResource?.startsWith(BARREL_OPTIMIZATION_PREFIX)) {
          ssrNamedModuleId = formatBarrelOptimizedResource(
            ssrNamedModuleId,
            mod.matchResource
          )
          resource = formatBarrelOptimizedResource(resource, mod.matchResource)
        }

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
          if (mod.layer !== WEBPACK_LAYERS.appPagesBrowser) continue

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
      if (/\/page(\.[^/]+)?$/.test(entryName)) {
        manifestEntryFiles.push(entryName.replace(/\/page(\.[^/]+)?$/, '/page'))
      }

      // Special case for the root not-found page.
      // dev: app/not-found
      // prod: app/_not-found
      if (/^app\/_?not-found(\.[^.]+)?$/.test(entryName)) {
        manifestEntryFiles.push(this.dev ? 'app/not-found' : 'app/_not-found')
      }

      const groupName = entryNameToGroupName(entryName)
      if (!manifestsPerGroup.has(groupName)) {
        manifestsPerGroup.set(groupName, [])
      }
      manifestsPerGroup.get(groupName)!.push(manifest)
    })

    // Generate per-page manifests.
    for (const pageName of manifestEntryFiles) {
      const mergedManifest: ClientReferenceManifest = {
        moduleLoading: {
          prefix,
          crossOrigin: crossOriginMode,
        },
        ssrModuleMapping: {},
        edgeSSRModuleMapping: {},
        clientModules: {},
        entryCSSFiles: {},
      }

      const segments = [...entryNameToGroupName(pageName).split('/'), 'page']
      let group = ''
      for (const segment of segments) {
        for (const manifest of manifestsPerGroup.get(group) || []) {
          mergeManifest(mergedManifest, manifest)
        }
        group += (group ? '/' : '') + segment
      }

      const json = JSON.stringify(mergedManifest)

      const pagePath = pageName.replace(/%5F/g, '_')
      const pageBundlePath = normalizePagePath(pagePath.slice('app'.length))
      assets[
        'server/app' + pageBundlePath + '_' + CLIENT_REFERENCE_MANIFEST + '.js'
      ] = new sources.RawSource(
        `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[${JSON.stringify(
          pagePath.slice('app'.length)
        )}]=${json}`
      ) as unknown as webpack.sources.RawSource

      if (pagePath === 'app/not-found') {
        // Create a separate special manifest for the root not-found page.
        assets['server/app/_not-found_' + CLIENT_REFERENCE_MANIFEST + '.js'] =
          new sources.RawSource(
            `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[${JSON.stringify(
              '/_not-found'
            )}]=${json}`
          ) as unknown as webpack.sources.RawSource
      }
    }

    pluginState.ASYNC_CLIENT_MODULES = []
  }
}

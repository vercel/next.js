// Async external import (maps to the runtime's `import(id)` helper). Used to
// load the emitted config bundle from disk by file:// URL.
declare const __turbopack_external_import__: (id: string) => Promise<any>

import type { Processor } from 'postcss'
import { pathToFileURL } from 'node:url'

// @ts-ignore
import postcss from '@vercel/turbopack/postcss'
import { getReadEnvVariables, toPath, type TransformIpc } from './transforms'

/**
 * Cache of initialized PostCSS processors ("config sessions"), keyed by the
 * original (project-relative) config file path.
 *
 * Each entry also records the `bundledPath` it was built from. The bundled path
 * is content-addressed on the Rust side, so when a config file changes its
 * bundled path changes too: a request for the same original path but a different
 * bundled path replaces the session in place (the stale processor is dropped and
 * GC'd). This keeps the map bounded by the set of distinct config files — an app
 * that keeps adding *new* configs will grow it, which is acceptable — while
 * editing an existing config never grows it.
 *
 * Workers are pulled from an idle queue without affinity to a config, so any
 * worker must be able to lazily load any config it is handed; that is exactly
 * what this map does on first sight of a key.
 */
const sessions = new Map<
  string,
  { bundledPath: string; processor: Promise<Processor> }
>()

async function loadConfig(bundledPath: string): Promise<Processor> {
  // The config has been emitted to disk as a standalone bundle by Turbopack.
  // `bundledPath` is an absolute disk path (the bundle lives under the output
  // root, which may be a different filesystem than the project). Absolute paths
  // don't work with ESM imports on Windows
  // (https://github.com/nodejs/node/issues/31710), so convert to a file:// URL.
  const configUrl = pathToFileURL(bundledPath).toString()
  const mod = await __turbopack_external_import__(configUrl)
  // Every config kind is emitted by `config_loader_source` as a wrapper module
  // exporting an async `loadPostcssConfig()` that returns the resolved config
  // (unwrapping `default` on the Rust side). The named export may live on `mod`
  // or, depending on CJS↔ESM interop, on `mod.default`.
  const loadPostcssConfig =
    mod.loadPostcssConfig ?? mod.default?.loadPostcssConfig
  if (typeof loadPostcssConfig !== 'function') {
    throw new Error('PostCSS config bundle did not export loadPostcssConfig')
  }
  let config = await loadPostcssConfig()
  if (typeof config === 'function') {
    config = await config({ env: 'development' })
  }
  if (typeof config === 'undefined') {
    throw new Error(
      'PostCSS config is undefined (make sure to export an function or object from config file)'
    )
  }
  let plugins: any[]
  if (Array.isArray(config.plugins)) {
    plugins = config.plugins.map((plugin: [string, any] | string | any) => {
      if (Array.isArray(plugin)) {
        return plugin
      } else if (typeof plugin === 'string') {
        return [plugin, {}]
      } else {
        return plugin
      }
    })
  } else if (typeof config.plugins === 'object') {
    plugins = Object.entries(config.plugins).filter(([, options]) => options)
  } else {
    plugins = []
  }
  const loadedPlugins = plugins.map((plugin) => {
    if (Array.isArray(plugin)) {
      const [arg, options] = plugin
      let pluginFactory = arg

      if (typeof pluginFactory === 'string') {
        pluginFactory = require(/* turbopackIgnore: true */ pluginFactory)
      }

      if (pluginFactory.default) {
        pluginFactory = pluginFactory.default
      }

      return pluginFactory(options)
    }
    return plugin
  })

  return postcss(loadedPlugins)
}

function getProcessor(
  originalConfigPath: string,
  bundledConfigPath: string
): Promise<Processor> {
  const cached = sessions.get(originalConfigPath)
  if (cached && cached.bundledPath === bundledConfigPath) {
    return cached.processor
  }
  const processor = loadConfig(bundledConfigPath)
  sessions.set(originalConfigPath, {
    bundledPath: bundledConfigPath,
    processor,
  })
  // Evict on failure so a later request can retry instead of caching a rejection.
  processor.catch(() => {
    if (sessions.get(originalConfigPath)?.processor === processor) {
      sessions.delete(originalConfigPath)
    }
  })
  return processor
}

export default async function transform(
  ipc: TransformIpc,
  cssContent: string,
  name: string,
  originalConfigPath: string,
  bundledConfigPath: string,
  sourceMap: boolean
) {
  const processor = await getProcessor(originalConfigPath, bundledConfigPath)
  const { css, map, messages } = await processor.process(cssContent, {
    from: name,
    to: name,
    map: sourceMap
      ? {
          inline: false,
          annotation: false,
        }
      : undefined,
  })

  const assets = []
  const filePaths: string[] = []
  const buildFilePaths: string[] = []
  const directories: Array<[string, string]> = []

  for (const msg of messages) {
    switch (msg.type) {
      case 'asset':
        assets.push({
          file: msg.file,
          content: msg.content,
          sourceMap: !sourceMap
            ? undefined
            : typeof msg.sourceMap === 'string'
              ? msg.sourceMap
              : JSON.stringify(msg.sourceMap),
          // There is also an info field, which we currently ignore
        })
        break
      case 'dependency':
      case 'missing-dependency':
        filePaths.push(toPath(msg.file))
        break
      case 'build-dependency':
        buildFilePaths.push(toPath(msg.file))
        break
      case 'dir-dependency':
        directories.push([toPath(msg.dir), msg.glob])
        break
      case 'context-dependency':
        directories.push([toPath(msg.dir), '**'])
        break
      default:
        // TODO: do we need to do anything here?
        break
    }
  }
  ipc.sendInfo({
    type: 'dependencies',
    filePaths,
    directories,
    buildFilePaths,
    envVariables: getReadEnvVariables(),
  })
  return {
    css,
    map: sourceMap ? JSON.stringify(map) : undefined,
    assets,
  }
}

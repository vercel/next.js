// SWC compile for individual source files.
// Port of taskfile-swc.js with a file-centric API instead of taskr plugin chains.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { transform } = require('@swc/core')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(__dirname, '../..')

const MODERN_BROWSERSLIST_TARGET = require(
  path.join(PKG_ROOT, 'src/shared/lib/modern-browserslist-target')
)

const NEXT_VERSION = require(path.join(PKG_ROOT, 'package.json')).version
const NEXT_NODE_ENGINES = require(path.join(PKG_ROOT, 'package.json')).engines
  .node
const REQUIRED_REACT_VERSION = require(
  path.resolve(PKG_ROOT, '../../package.json')
).devDependencies['react-server-dom-webpack']

const SWC_PLUGIN_WASM = path.join(PKG_ROOT, 'next_error_code_swc_plugin.wasm')

function setNextVersion(code) {
  return code
    .replace(/process\.env\.__NEXT_VERSION/g, JSON.stringify(NEXT_VERSION))
    .replace(
      /process\.env\.__NEXT_REQUIRED_NODE_VERSION_RANGE/g,
      JSON.stringify(NEXT_NODE_ENGINES)
    )
    .replace(
      /process\.env\.REQUIRED_APP_REACT_VERSION/,
      JSON.stringify(REQUIRED_REACT_VERSION)
    )
}

function swcOptions({
  serverOrClient,
  esm,
  srcFile,
  distFile,
  skipErrorPlugin,
}) {
  const isClient = serverOrClient === 'client'
  const isTsx = srcFile.endsWith('.tsx')

  // Skip the error-code plugin for tests/stories: taskfile-swc.js did the same.
  // The plugin rewrites `new Error(...)` into `Object.defineProperty(...)` which
  // breaks snapshot tests that assert on exact error construction.
  const base = path.basename(srcFile)
  const isTestOrStory =
    base.includes('.test.') || base.includes('.stories.')
  const plugins =
    skipErrorPlugin || isTestOrStory ? [] : [[SWC_PLUGIN_WASM, {}]]

  const moduleOpts = esm
    ? { type: 'es6' }
    : {
        type: 'commonjs',
        ignoreDynamic: true,
        exportInteropAnnotation: true,
      }

  const envTargets = isClient
    ? { targets: MODERN_BROWSERSLIST_TARGET }
    : { targets: { node: '16.8.0' } }

  return {
    filename: srcFile,
    sourceMaps: true,
    inlineSourcesContent: true,
    sourceFileName: path.relative(path.dirname(distFile), srcFile),
    module: moduleOpts,
    env: envTargets,
    jsc: {
      loose: true,
      externalHelpers: isClient,
      parser: {
        syntax: 'typescript',
        dynamicImport: true,
        importAttributes: true,
        tsx: isTsx,
      },
      experimental: {
        keepImportAttributes: Boolean(esm),
        plugins,
      },
      transform: {
        react: {
          runtime: 'automatic',
          pragmaFrag: 'React.Fragment',
          throwIfNamespace: true,
          development: false,
          useBuiltins: true,
        },
      },
    },
  }
}

/**
 * Compile a single source file with SWC and write the result (and sourcemap)
 * to the destination directory.
 *
 * @param {object} args
 * @param {string} args.srcFile        Absolute path to the source file.
 * @param {string} args.destDir        Absolute path to the destination directory.
 * @param {'server'|'client'} args.serverOrClient
 * @param {boolean} [args.esm]
 * @param {boolean} [args.stripExtension]
 * @param {boolean} [args.interopClientDefaultExport]
 * @param {string|number} [args.mode]  File mode for chmod (e.g. '0755' for CLI entry points).
 * @param {string|null} [args.rebaseFrom]  If provided, re-root the src path from this directory.
 */
export async function compileFile({
  srcFile,
  destDir,
  serverOrClient,
  esm = false,
  stripExtension = false,
  interopClientDefaultExport = false,
  mode = null,
  skipErrorPlugin = false,
}) {
  const ext = path.extname(srcFile)
  const base = path.basename(srcFile)
  const skippedExt = new Set(['.d.ts', '.json', '.jsonc', '.woff2'])

  // Non-compilable assets: copy as-is.
  if (
    skippedExt.has(ext) ||
    base.endsWith('.d.ts') ||
    ext === '.woff2' ||
    ext === '.wasm' ||
    ext === '.mjs'
  ) {
    const destFile = path.join(destDir, base)
    await fs.mkdir(path.dirname(destFile), { recursive: true })
    await fs.copyFile(srcFile, destFile)
    if (mode != null) {
      await fs.chmod(destFile, typeof mode === 'string' ? parseInt(mode, 8) : mode)
    }
    return
  }

  const srcData = await fs.readFile(srcFile, 'utf8')

  // Destination filename: replace extension with .js (or .mjs for .mts)
  let destBase
  if (!ext) {
    destBase = base
  } else if (stripExtension) {
    destBase = base.slice(0, -ext.length)
  } else {
    destBase = base.slice(0, -ext.length) + (ext === '.mts' ? '.mjs' : '.js')
  }
  const destFile = path.join(destDir, destBase)

  const options = swcOptions({
    serverOrClient,
    esm,
    srcFile,
    distFile: destFile,
    skipErrorPlugin,
  })

  const output = await transform(srcData, options)

  let code = output.code

  if (interopClientDefaultExport && !esm) {
    code += `
if ((typeof exports.default === 'function' || (typeof exports.default === 'object' && exports.default !== null)) && typeof exports.default.__esModule === 'undefined') {
  Object.defineProperty(exports.default, '__esModule', { value: true });
  Object.assign(exports.default, exports);
  module.exports = exports.default;
}
`
  }

  code = setNextVersion(code)

  await fs.mkdir(path.dirname(destFile), { recursive: true })

  if (output.map) {
    const mapName = `${destBase}.map`
    code += `\n//# sourceMappingURL=${mapName}`
    const sourceMapPayload = JSON.parse(output.map)
    if ('ignoreList' in sourceMapPayload) {
      throw new Error(
        'SWC already sets an ignoreList. We may no longer need to manually set ignoreList.'
      )
    }
    sourceMapPayload.ignoreList = sourceMapPayload.sources.map((_, i) => i)
    await fs.writeFile(path.join(destDir, mapName), JSON.stringify(sourceMapPayload))
  }

  await fs.writeFile(destFile, code)

  if (mode != null) {
    await fs.chmod(destFile, typeof mode === 'string' ? parseInt(mode, 8) : mode)
  }
}

export { PKG_ROOT }

// Glob a source pattern, compile every matching file in parallel with SWC,
// and write the results to a destination directory (mirroring the src/ layout).

import path from 'node:path'
import { createRequire } from 'node:module'
import { compileFile, PKG_ROOT } from './swc.mjs'

const require = createRequire(import.meta.url)
const glob = require('glob')

// Per-variant concurrency cap. Many variants run in parallel at the
// compile.mjs level, so keeping this small avoids 36 × N concurrent SWC
// transforms, which overloads the WASM plugin loader.
const MAX_CONCURRENCY = 4

/**
 * @param {object} args
 * @param {string} args.srcGlob        Glob pattern, relative to packages/next.
 * @param {string[]} [args.ignore]     Additional glob ignore patterns.
 * @param {string} args.destDir        Destination directory, relative to packages/next.
 * @param {'server'|'client'} args.serverOrClient
 * @param {boolean} [args.esm]
 * @param {boolean} [args.stripExtension]
 * @param {boolean} [args.interopClientDefaultExport]
 * @param {string} [args.mode]         Chmod mode (e.g. '0755').
 * @param {string} [args.srcBase]      Base directory the glob is relative to (defaults to derived from glob prefix).
 * @param {string[]} [args.additionalDestDirs]   Also write each compiled file to these additional destinations.
 */
export async function compileGlob({
  srcGlob,
  ignore = [],
  destDir,
  serverOrClient,
  esm = false,
  stripExtension = false,
  interopClientDefaultExport = false,
  mode = null,
  srcBase,
  additionalDestDirs = [],
}) {
  const absGlob = path.join(PKG_ROOT, srcGlob)
  const absDest = path.resolve(PKG_ROOT, destDir)
  const absAdditional = additionalDestDirs.map((d) => path.resolve(PKG_ROOT, d))

  // Determine srcBase: the directory we strip from each matched file to get its
  // relative path under destDir. Defaults to the longest fixed prefix of the glob.
  const base = srcBase
    ? path.resolve(PKG_ROOT, srcBase)
    : path.resolve(PKG_ROOT, deriveBase(srcGlob))

  const matches = glob.sync(absGlob, {
    ignore: ignore.map((p) => (path.isAbsolute(p) ? p : path.join(PKG_ROOT, p))),
    nodir: true,
    dot: false,
  })

  let inFlight = 0
  const queue = matches.slice()
  const errors = []

  const worker = async () => {
    while (queue.length) {
      const srcFile = queue.shift()
      if (!srcFile) return
      try {
        const relFromBase = path.relative(base, srcFile)
        const relDir = path.dirname(relFromBase)
        const targets = [absDest, ...absAdditional]
        for (const targetDir of targets) {
          const destTarget = relDir === '.' ? targetDir : path.join(targetDir, relDir)
          await compileFile({
            srcFile,
            destDir: destTarget,
            serverOrClient,
            esm,
            stripExtension,
            interopClientDefaultExport,
            mode,
          })
        }
      } catch (err) {
        errors.push({ srcFile, err })
      }
    }
  }

  const workers = []
  for (let i = 0; i < Math.min(MAX_CONCURRENCY, matches.length); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)

  if (errors.length) {
    for (const { srcFile, err } of errors) {
      console.error(`Failed to compile ${srcFile}`)
      console.error(err)
    }
    throw new Error(`${errors.length} file(s) failed to compile for glob ${srcGlob}`)
  }
}

function deriveBase(pattern) {
  // 'src/server/**/*.ts' → 'src/server'
  // 'src/pages/_app.tsx' → 'src/pages'
  const parts = pattern.split('/')
  const i = parts.findIndex((p) => p.includes('*') || p.includes('?') || p.includes('['))
  if (i < 0) return path.dirname(pattern)
  return parts.slice(0, i).join('/') || '.'
}

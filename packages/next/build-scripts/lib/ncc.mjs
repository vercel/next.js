// NCC bundle helper. Port of taskfile-ncc.js with an explicit entry/destDir
// API instead of a taskr plugin chain.

import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createRequire, Module } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ncc = require('@vercel/ncc')
const findUp = require('find-up')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// packages/next/
export const PKG_ROOT = path.resolve(__dirname, '../..')

// Mirror taskfile-ncc.js: resolve bundled package paths from a phantom module
// anchored at `packages/next/bundles/_`. This keeps resolution identical to the
// original even though the `bundles/` directory isn't real — Node walks up
// from `bundles/` to find `packages/next/node_modules`.
const bundleAnchor = new Module(path.resolve(PKG_ROOT, 'bundles', '_'))
bundleAnchor.filename = bundleAnchor.id
bundleAnchor.paths = Module._nodeModulePaths(bundleAnchor.id)
const bundleRequire = bundleAnchor.require.bind(bundleAnchor)
bundleRequire.resolve = (request, options) =>
  Module._resolveFilename(request, bundleAnchor, false, options)

// Case-insensitive filesystems on macOS hide the difference, but on Linux CI
// the casing matters. Try all common variants.
const potentialLicenseFiles = [
  'LICENSE',
  'license',
  'LICENSE.md',
  'License.md',
  'license.md',
]

/**
 * Compile `entry` with @vercel/ncc and write the output (plus assets, LICENSE,
 * and a minimal package.json) to `destDir`.
 *
 * @param {object} args
 * @param {string} args.entry                Absolute path to the entry file.
 * @param {string} args.destDir              Absolute destination directory.
 * @param {object} [args.options]            Extra ncc options (externals, target, mainFields, customEmit, esm, ...).
 * @param {string} [args.packageName]        npm package name. Used to scrub self-externals and write package.json/LICENSE.
 * @param {string} [args.bundleName]         Override the LICENSE/package.json output dir name (defaults to packageName).
 * @param {string} [args.packageJsonName]    Override the `name` field in the emitted package.json.
 * @param {boolean} [args.precompiled=true]  false => write LICENSE/package.json under `dist/src/compiled/...` instead of `src/compiled/...`.
 * @param {boolean} [args.minify=true]
 * @param {string} [args.target]
 * @param {(code: string) => string} [args.transformOutput]
 *        Optional post-process for the main bundle code (replaces the taskr
 *        `.run({ every: true }, ...)` pattern used by a handful of recipes).
 */
export async function nccBundle({
  entry,
  destDir,
  options = {},
  packageName,
  bundleName,
  packageJsonName,
  precompiled = true,
  minify = true,
  target,
  externals,
  transformOutput,
}) {
  const filename = path.basename(entry)

  let finalExternals = externals ?? options.externals
  if (finalExternals && packageName) {
    // Prevent a package aliasing to itself (which would create an infinite
    // require loop at runtime).
    finalExternals = { ...finalExternals }
    delete finalExternals[packageName]
  }

  const nccOpts = {
    ...options,
    filename,
    minify,
    assetBuilds: true,
    cache: false,
  }
  if (finalExternals !== undefined) nccOpts.externals = finalExternals
  if (target !== undefined) nccOpts.target = target

  const { code, assets } = await ncc(entry, nccOpts)

  const mainCode = transformOutput ? transformOutput(code) : code

  await fs.mkdir(destDir, { recursive: true })
  const writes = [fs.writeFile(path.join(destDir, filename), mainCode)]

  for (const key of Object.keys(assets)) {
    const assetDest = path.join(destDir, key)
    writes.push(
      fs
        .mkdir(path.dirname(assetDest), { recursive: true })
        .then(() => fs.writeFile(assetDest, assets[key].source))
    )
  }

  await Promise.all(writes)

  if (packageName) {
    await writePackageManifest({
      packageName,
      main: filename,
      bundleName,
      precompiled,
      packageJsonName,
    })
  }
}

async function writePackageManifest({
  packageName,
  main,
  bundleName,
  precompiled,
  packageJsonName,
}) {
  let packagePath
  try {
    packagePath = bundleRequire.resolve(packageName + '/package.json')
  } catch (_) {
    // Newer packages sometimes omit package.json from their exports map.
    // Fall back to walking up from the main entry.
    packagePath = findUp.sync('package.json', {
      cwd: path.dirname(bundleRequire.resolve(packageName)),
    })
  }
  const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'))
  const { name, author, license } = pkg

  const compiledPackagePath = path.join(
    PKG_ROOT,
    `${precompiled ? '' : 'dist/'}src/compiled/${bundleName || packageName}`
  )
  await fs.mkdir(compiledPackagePath, { recursive: true })

  for (const licenseFile of potentialLicenseFiles) {
    const candidate = path.join(path.dirname(packagePath), licenseFile)
    if (existsSync(candidate)) {
      const data = await fs.readFile(candidate, 'utf8')
      await fs.writeFile(path.join(compiledPackagePath, 'LICENSE'), data)
      break
    }
  }

  const ext = path.extname(main)
  const manifest = {
    name: packageJsonName ?? name,
    main: path.basename(main, ext),
  }
  if (author) manifest.author = author
  if (license) manifest.license = license

  await fs.writeFile(
    path.join(compiledPackagePath, 'package.json'),
    JSON.stringify(manifest) + '\n'
  )
}

export { bundleRequire }

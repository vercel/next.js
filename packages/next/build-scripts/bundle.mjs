#!/usr/bin/env node
// Runtime-bundle builder. Runs all 14 webpack/rspack variants (13 runtime +
// devtools) in parallel. Port of the next_bundle_* tasks from taskfile.js.

import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { runRspack } from './lib/rspack.mjs'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(__dirname, '..')

process.chdir(PKG_ROOT)

const runtimeConfigFactory = require(
  path.join(PKG_ROOT, 'next-runtime.webpack-config.js')
)
const devtoolsConfigFactory = require(
  path.join(PKG_ROOT, 'next-devtools.webpack-config.js')
)

const variants = [
  {
    name: 'next_bundle_app_prod_turbo',
    bundleName: 'next-bundle-app-prod-turbo',
    config: { turbo: true, bundleType: 'app' },
  },
  {
    name: 'next_bundle_app_prod',
    bundleName: 'next-bundle-app-prod',
    config: { dev: false, bundleType: 'app' },
  },
  {
    name: 'next_bundle_app_dev_turbo',
    bundleName: 'next-bundle-app-dev-turbo',
    config: { turbo: true, dev: true, bundleType: 'app' },
  },
  {
    name: 'next_bundle_app_dev',
    bundleName: 'next-bundle-app-dev',
    config: { dev: true, bundleType: 'app' },
  },
  {
    name: 'next_bundle_app_prod_turbo_experimental',
    bundleName: 'next-bundle-app-prod-turbo-experimental',
    config: { turbo: true, bundleType: 'app', experimental: true },
  },
  {
    name: 'next_bundle_app_prod_experimental',
    bundleName: 'next-bundle-app-prod-experimental',
    config: { dev: false, bundleType: 'app', experimental: true },
  },
  {
    name: 'next_bundle_app_dev_turbo_experimental',
    bundleName: 'next-bundle-app-dev-turbo-experimental',
    config: { turbo: true, dev: true, bundleType: 'app', experimental: true },
  },
  {
    name: 'next_bundle_app_dev_experimental',
    bundleName: 'next-bundle-app-dev-experimental',
    config: { dev: true, bundleType: 'app', experimental: true },
  },
  {
    name: 'next_bundle_pages_prod',
    bundleName: 'next-bundle-pages-prod',
    config: { dev: false, bundleType: 'pages' },
  },
  {
    name: 'next_bundle_pages_dev',
    bundleName: 'next-bundle-pages-dev',
    config: { dev: true, bundleType: 'pages' },
  },
  {
    name: 'next_bundle_pages_prod_turbo',
    bundleName: 'next-bundle-pages-prod-turbo',
    config: { turbo: true, bundleType: 'pages' },
  },
  {
    name: 'next_bundle_pages_dev_turbo',
    bundleName: 'next-bundle-pages-dev-turbo',
    config: { turbo: true, dev: true, bundleType: 'pages' },
  },
  {
    name: 'next_bundle_server',
    bundleName: 'next-bundle-server',
    config: { dev: false, bundleType: 'server' },
  },
  {
    name: 'next_bundle_devtools',
    bundleName: 'next-bundle-devtools-dev',
    isDevtools: true,
  },
]

function buildConfig(variant, { watch }) {
  if (variant.isDevtools) {
    return devtoolsConfigFactory({ dev: watch })
  }
  return runtimeConfigFactory(variant.config)
}

async function runVariant(variant, { watch }) {
  const t0 = Date.now()
  console.log(`[bundle] ${variant.name} start`)
  const config = buildConfig(variant, { watch })
  const result = runRspack({ config, name: variant.bundleName, watch })
  if (!watch) {
    await result
    const elapsed = Date.now() - t0
    console.log(
      `[bundle] ${variant.name.padEnd(48)} ${elapsed.toString().padStart(6)}ms`
    )
  }
  return result
}

/**
 * Run the requested bundle variants in parallel.
 *
 * @param {string[]} [names]       Variant names to run. Empty/undefined = all.
 * @param {object} [opts]
 * @param {boolean} [opts.watch]    Run rspack in watch mode.
 */
export async function runBundles(names = [], { watch = false } = {}) {
  const filtered = names.length
    ? variants.filter((v) => names.includes(v.name))
    : variants

  if (names.length && filtered.length !== names.length) {
    const found = new Set(filtered.map((v) => v.name))
    const missing = names.filter((n) => !found.has(n))
    throw new Error(`Unknown bundle variant(s): ${missing.join(', ')}`)
  }

  const start = Date.now()
  const results = await Promise.all(
    filtered.map((variant) => runVariant(variant, { watch }))
  )
  if (!watch) {
    console.log(`[bundle] TOTAL: ${Date.now() - start}ms`)
  }
  return results
}

async function main(argv) {
  const args = argv.slice(2)
  const watch = args.includes('--watch')
  const names = args.filter((a) => !a.startsWith('--'))
  await runBundles(names, { watch })
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main(process.argv).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

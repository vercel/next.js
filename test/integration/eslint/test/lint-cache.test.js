import fs from 'fs-extra'
import os from 'os'

import { join } from 'path'

import findUp from 'next/dist/compiled/find-up'
import { File, nextBuild, nextLint } from 'next-test-utils'

const dirFirstTimeSetup = join(__dirname, '../first-time-setup')
const dirCustomConfig = join(__dirname, '../custom-config')
const dirWebVitalsConfig = join(__dirname, '../config-core-web-vitals')
const dirPluginRecommendedConfig = join(
  __dirname,
  '../plugin-recommended-config'
)
const dirPluginCoreWebVitalsConfig = join(
  __dirname,
  '../plugin-core-web-vitals-config'
)
const dirIgnoreDuringBuilds = join(__dirname, '../ignore-during-builds')
const dirBaseDirectories = join(__dirname, '../base-directories')
const dirBaseDirectoriesConfigFile = new File(
  join(dirBaseDirectories, '/next.config.js')
)
const dirCustomDirectories = join(__dirname, '../custom-directories')
const dirConfigInPackageJson = join(__dirname, '../config-in-package-json')
const dirInvalidOlderEslintVersion = join(
  __dirname,
  '../invalid-eslint-version'
)
const dirMaxWarnings = join(__dirname, '../max-warnings')
const dirEmptyDirectory = join(__dirname, '../empty-directory')
const dirEslintIgnore = join(__dirname, '../eslint-ignore')
const dirNoEslintPlugin = join(__dirname, '../no-eslint-plugin')
const dirNoConfig = join(__dirname, '../no-config')
const dirEslintCache = join(__dirname, '../eslint-cache')
const dirEslintCacheCustomDir = join(__dirname, '../eslint-cache-custom-dir')
const dirFileLinting = join(__dirname, '../file-linting')
const mjsCjsLinting = join(__dirname, '../mjs-cjs-linting')
const dirTypescript = join(__dirname, '../with-typescript')

test('eslint caching is enabled by default', async () => {
  const cacheDir = join(dirEslintCache, '.next', 'cache')

  await fs.remove(cacheDir)
  await nextLint(dirEslintCache, [])

  const files = await fs.readdir(join(cacheDir, 'eslint/'))
  const cacheExists = files.some((f) => /\.cache/.test(f))

  expect(cacheExists).toBe(true)
})

test('eslint caching is disabled with the --no-cache flag', async () => {
  const cacheDir = join(dirEslintCache, '.next', 'cache')

  await fs.remove(cacheDir)
  await nextLint(dirEslintCache, ['--no-cache'])

  expect(fs.existsSync(join(cacheDir, 'eslint/'))).toBe(false)
})

test('the default eslint cache lives in the user defined build directory', async () => {
  const oldCacheDir = join(dirEslintCacheCustomDir, '.next', 'cache')
  const newCacheDir = join(dirEslintCacheCustomDir, 'build', 'cache')

  await fs.remove(oldCacheDir)
  await fs.remove(newCacheDir)

  await nextLint(dirEslintCacheCustomDir, [])

  expect(fs.existsSync(oldCacheDir)).toBe(false)

  const files = await fs.readdir(join(newCacheDir, 'eslint/'))
  const cacheExists = files.some((f) => /\.cache/.test(f))

  expect(cacheExists).toBe(true)
})

test('the --cache-location flag allows the user to define a separate cache location', async () => {
  const cacheFile = join(dirEslintCache, '.eslintcache')

  await fs.remove(cacheFile)
  await nextLint(dirEslintCache, ['--cache-location', cacheFile])

  const hasCache = fs.existsSync(cacheFile)
  await fs.remove(cacheFile) // remove after generate
  expect(hasCache).toBe(true)
})

const getEslintCacheContent = async (cacheDir) => {
  const eslintCacheDir = join(cacheDir, 'eslint/')
  let files = await fs.readdir(eslintCacheDir)
  let cacheFiles = files.filter((f) => /\.cache/.test(f))
  expect(cacheFiles.length).toBe(1)
  const cacheFile = join(eslintCacheDir, cacheFiles[0])
  return await fs.readFile(cacheFile, 'utf8')
}

test('the default eslint caching strategy is metadata', async () => {
  const cacheDir = join(dirEslintCache, '.next', 'cache')

  await fs.remove(cacheDir)
  await nextLint(dirEslintCache)

  const defaultStrategyCache = await getEslintCacheContent(cacheDir)

  await fs.remove(cacheDir)
  await nextLint(dirEslintCache, ['--cache-strategy', 'metadata'])

  const metadataStrategyCache = await getEslintCacheContent(cacheDir)

  expect(metadataStrategyCache).toBe(defaultStrategyCache)
})

test('cache with content strategy is different from the one with default strategy', async () => {
  const cacheDir = join(dirEslintCache, '.next', 'cache')

  await fs.remove(cacheDir)
  await nextLint(dirEslintCache)

  const defaultStrategyCache = await getEslintCacheContent(cacheDir)

  await fs.remove(cacheDir)
  await nextLint(dirEslintCache, ['--cache-strategy', 'content'])

  const contentStrategyCache = await getEslintCacheContent(cacheDir)

  expect(contentStrategyCache).not.toBe(defaultStrategyCache)
})

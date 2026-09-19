import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  handleBuildComplete,
} = require('next/dist/build/adapter/build-complete')
const { Bundler } = require('next/dist/lib/bundler')
const dir = process.cwd()
const distDir = path.join(dir, '.next')
const readJSON = async (file) =>
  JSON.parse(await readFile(path.join(distDir, file), 'utf8'))
const { config, files } = await readJSON('required-server-files.json')
const prerenderManifest = await readJSON('prerender-manifest.json')

// Current root-parameter inference only emits blocking entries. Exercise the
// existing adapter contract for a servable root fallback using the real shell
// built by this fixture, without introducing a paramMatching dependency.
const root = prerenderManifest.dynamicRoutes['/[lang]']
if (root.fallback !== null || root.fallbackRootParams.join(',') !== 'lang') {
  throw new Error('Expected a blocking root-parameter manifest entry')
}
root.fallback = '/[lang]'

await handleBuildComplete({
  dir,
  config,
  appType: 'app',
  buildId: await readFile(path.join(distDir, 'BUILD_ID'), 'utf8'),
  configOutDir: path.join(dir, 'out'),
  distDir,
  pageKeys: Object.keys(await readJSON('server/pages-manifest.json')),
  appPageKeys: Object.keys(await readJSON('server/app-paths-manifest.json')),
  bundler: process.argv[2] === 'turbo' ? Bundler.Turbopack : Bundler.Webpack,
  repoRoot: config.repoRoot,
  outputFileTracingRoot: config.outputFileTracingRoot,
  adapterPath: require.resolve('./adapter.mjs'),
  staticPages: new Set(['/404', '/500']),
  serverPropsPages: new Set(),
  nextVersion: require('next/package.json').version,
  hasStatic404: true,
  hasStatic500: true,
  previewProps: prerenderManifest.preview,
  routesManifest: await readJSON('routes-manifest.json'),
  prerenderManifest,
  middlewareManifest: await readJSON('server/middleware-manifest.json'),
  functionsConfigManifest: await readJSON(
    'server/functions-config-manifest.json'
  ),
  requiredServerFiles: files,
  hasNodeMiddleware: false,
  hasInstrumentationHook: false,
})

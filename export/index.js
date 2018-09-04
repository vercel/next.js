import del from 'del'
import cp from 'recursive-copy'
import mkdirp from 'mkdirp-then'
import { extname, resolve, join, dirname, sep } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import loadConfig from '../server/config'
import {PHASE_EXPORT, SERVER_DIRECTORY, PAGES_MANIFEST, CONFIG_FILE, BUILD_ID_FILE, CLIENT_STATIC_FILES_PATH} from '../lib/constants'
import { renderToHTML } from '../server/render'
import { setAssetPrefix } from '../lib/asset'
import * as envConfig from '../lib/runtime-config'

export default async function (dir, options, configuration) {
  dir = resolve(dir)
  const nextConfig = configuration || loadConfig(PHASE_EXPORT, dir)
  const distDir = join(dir, nextConfig.distDir)

  log(`> using build directory: ${distDir}`)

  if (!existsSync(distDir)) {
    throw new Error(`Build directory ${distDir} does not exist. Make sure you run "next build" before running "next start" or "next export".`)
  }

  const buildId = readFileSync(join(distDir, BUILD_ID_FILE), 'utf8')
  const pagesManifest = require(join(distDir, SERVER_DIRECTORY, PAGES_MANIFEST))

  const pages = Object.keys(pagesManifest)
  const defaultPathMap = {}

  for (const page of pages) {
    // _document and _app are not real pages.
    if (page === '/_document' || page === '/_app') {
      continue
    }

    if (page === '/_error') {
      defaultPathMap['/404'] = { page }
      continue
    }

    defaultPathMap[page] = { page }
  }

  // Initialize the output directory
  const outDir = options.outdir
  await del(join(outDir, '*'))
  await mkdirp(join(outDir, '_next', buildId))

  // Copy static directory
  if (existsSync(join(dir, 'static'))) {
    log('  copying "static" directory')
    await cp(
      join(dir, 'static'),
      join(outDir, 'static'),
      { expand: true }
    )
  }

  // Copy .next/static directory
  if (existsSync(join(distDir, CLIENT_STATIC_FILES_PATH))) {
    log('  copying "static build" directory')
    await cp(
      join(distDir, CLIENT_STATIC_FILES_PATH),
      join(outDir, '_next', CLIENT_STATIC_FILES_PATH)
    )
  }

  // Copy dynamic import chunks
  if (existsSync(join(distDir, 'chunks'))) {
    log('  copying dynamic import chunks')

    await mkdirp(join(outDir, '_next', 'webpack'))
    await cp(
      join(distDir, 'chunks'),
      join(outDir, '_next', 'webpack', 'chunks')
    )
  }

  // Get the exportPathMap from the config file
  if (typeof nextConfig.exportPathMap !== 'function') {
    console.log(`> No "exportPathMap" found in "${CONFIG_FILE}". Generating map from "./pages"`)
    nextConfig.exportPathMap = async (defaultMap) => {
      return defaultMap
    }
  }

  // Start the rendering process
  const renderOpts = {
    dir,
    buildId,
    nextExport: true,
    assetPrefix: nextConfig.assetPrefix.replace(/\/$/, ''),
    distDir,
    dev: false,
    staticMarkup: false,
    hotReloader: null
  }

  const {serverRuntimeConfig, publicRuntimeConfig} = nextConfig

  if (publicRuntimeConfig) {
    renderOpts.runtimeConfig = publicRuntimeConfig
  }

  envConfig.setConfig({
    serverRuntimeConfig,
    publicRuntimeConfig
  })

  // set the assetPrefix to use for 'next/asset'
  setAssetPrefix(renderOpts.assetPrefix)

  // We need this for server rendering the Link component.
  global.__NEXT_DATA__ = {
    nextExport: true
  }

  const exportPathMap = await nextConfig.exportPathMap(defaultPathMap)
  const exportPaths = Object.keys(exportPathMap)

  for (const path of exportPaths) {
    log(`> exporting path: ${path}`)
    if (!path.startsWith('/')) {
      throw new Error(`path "${path}" doesn't start with a backslash`)
    }

    const { page, query = {} } = exportPathMap[path]
    const req = { url: path }
    const res = {}

    let htmlFilename = `${path}${sep}index.html`
    if (extname(path) !== '') {
      // If the path has an extension, use that as the filename instead
      htmlFilename = path
    } else if (path === '/') {
      // If the path is the root, just use index.html
      htmlFilename = 'index.html'
    }
    const baseDir = join(outDir, dirname(htmlFilename))
    const htmlFilepath = join(outDir, htmlFilename)

    await mkdirp(baseDir)

    const html = await renderToHTML(req, res, page, query, renderOpts)
    writeFileSync(htmlFilepath, html, 'utf8')
  }

  // Add an empty line to the console for the better readability.
  log('')

  function log (message) {
    if (options.silent) return
    console.log(message)
  }
}

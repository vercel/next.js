import { cpus } from 'os'
import { fork } from 'child_process'
import cp from 'recursive-copy'
import mkdirpModule from 'mkdirp'
import { resolve, join } from 'path'
import { existsSync, readFileSync } from 'fs'
import loadConfig from 'next-server/next-config'
import { PHASE_EXPORT, SERVER_DIRECTORY, PAGES_MANIFEST, CONFIG_FILE, BUILD_ID_FILE, CLIENT_STATIC_FILES_PATH } from 'next-server/constants'
import createProgress from 'tty-aware-progress'
import { promisify } from 'util'
import { recursiveDelete } from '../lib/recursive-delete'
import { formatAmpMessages } from '../build/output/index'

const mkdirp = promisify(mkdirpModule)

export default async function (dir, options, configuration) {
  function log (message) {
    if (options.silent) return
    console.log(message)
  }

  dir = resolve(dir)
  const nextConfig = configuration || loadConfig(PHASE_EXPORT, dir)
  const concurrency = options.concurrency || 10
  const threads = options.threads || Math.max(cpus().length - 1, 1)
  const distDir = join(dir, nextConfig.distDir)
  const subFolders = nextConfig.experimental.exportTrailingSlash

  if (nextConfig.target !== 'server') throw new Error('Cannot export when target is not server. https://err.sh/zeit/next.js/next-export-serverless')

  log(`> using build directory: ${distDir}`)

  if (!existsSync(distDir)) {
    throw new Error(`Build directory ${distDir} does not exist. Make sure you run "next build" before running "next start" or "next export".`)
  }

  const buildId = readFileSync(join(distDir, BUILD_ID_FILE), 'utf8')
  const pagesManifest = require(join(distDir, SERVER_DIRECTORY, PAGES_MANIFEST))

  const pages = Object.keys(pagesManifest)
  const defaultPathMap = {}

  for (const page of pages) {
    // _document and _app are not real pages
    // _error is exported as 404.html later on
    if (page === '/_document' || page === '/_app' || page === '/_error') {
      continue
    }

    defaultPathMap[page] = { page }
  }

  // Initialize the output directory
  const outDir = options.outdir
  await recursiveDelete(join(outDir))
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

  const { serverRuntimeConfig, publicRuntimeConfig } = nextConfig

  if (publicRuntimeConfig) {
    renderOpts.runtimeConfig = publicRuntimeConfig
  }

  // We need this for server rendering the Link component.
  global.__NEXT_DATA__ = {
    nextExport: true
  }

  log(`  launching ${threads} threads with concurrency of ${concurrency} per thread`)
  const exportPathMap = await nextConfig.exportPathMap(defaultPathMap, { dev: false, dir, outDir, distDir, buildId })
  exportPathMap['/404.html'] = exportPathMap['/404.html'] || { page: '/_error' }
  const exportPaths = Object.keys(exportPathMap)

  const progress = !options.silent && createProgress(exportPaths.length)

  const chunks = exportPaths.reduce((result, route, i) => {
    const worker = i % threads
    if (!result[worker]) {
      result[worker] = { paths: [], pathMap: {} }
    }
    result[worker].pathMap[route] = exportPathMap[route]
    result[worker].paths.push(route)
    return result
  }, [])

  const ampValidations = {}
  let hadValidationError = false

  await Promise.all(
    chunks.map(
      chunk =>
        new Promise((resolve, reject) => {
          const worker = fork(require.resolve('./worker'), [], {
            env: process.env
          })
          worker.send({
            distDir,
            buildId,
            exportPaths: chunk.paths,
            exportPathMap: chunk.pathMap,
            outDir,
            renderOpts,
            serverRuntimeConfig,
            concurrency,
            subFolders
          })
          worker.on('message', ({ type, payload }) => {
            if (type === 'progress' && progress) {
              progress()
            } else if (type === 'error') {
              reject(payload)
            } else if (type === 'done') {
              resolve()
            } else if (type === 'amp-validation') {
              ampValidations[payload.page] = payload.result
              hadValidationError = hadValidationError || payload.result.errors.length
            }
          })
        })
    )
  )

  if (Object.keys(ampValidations).length) {
    console.log(formatAmpMessages(ampValidations))
  }
  if (hadValidationError) {
    throw new Error(`AMP Validation caused the export to fail. https://err.sh/zeit/next.js/amp-export-validation`)
  }

  // Add an empty line to the console for the better readability.
  log('')
}

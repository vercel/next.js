import del from 'del'
import { cpus } from 'os'
import cp from 'recursive-copy'
import mkdirp from 'mkdirp-then'
import Progress from 'progress'
import { fork } from 'child_process'
import walk from 'walk'
import { resolve, join, sep } from 'path'
import { existsSync, readFileSync } from 'fs'
import loadConfig from '../server/config'
import {
  PHASE_EXPORT,
  SERVER_DIRECTORY,
  PAGES_MANIFEST,
  CONFIG_FILE,
  BUILD_ID_FILE
} from '../lib/constants'
import { getAvailableChunks } from '../server/utils'
import { setAssetPrefix } from '../lib/asset'
import * as envConfig from '../lib/runtime-config'

export default async function (dir, options, configuration) {
  dir = resolve(dir)
  const concurrency = options.concurrency || 10
  const threads = options.threads || Math.max(cpus().length, 1)
  const nextConfig = configuration || loadConfig(PHASE_EXPORT, dir)
  const distDir = join(dir, nextConfig.distDir)

  log(`> using build directory: ${distDir}`)

  if (!existsSync(distDir)) {
    throw new Error(
      `Build directory ${distDir} does not exist. Make sure you run "next build" before running "next start" or "next export".`
    )
  }

  const buildId = readFileSync(join(distDir, BUILD_ID_FILE), 'utf8')
  const pagesManifest = require(join(
    distDir,
    SERVER_DIRECTORY,
    PAGES_MANIFEST
  ))

  const pages = Object.keys(pagesManifest)
  const defaultPathMap = {}

  for (const page of pages) {
    // _document and _app are not real pages.
    if (page === '/_document' || page === '/_app') {
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
    await cp(join(dir, 'static'), join(outDir, 'static'), { expand: true })
  }

  // Copy .next/static directory
  if (existsSync(join(distDir, 'static'))) {
    log('  copying "static build" directory')
    await cp(join(distDir, 'static'), join(outDir, '_next', 'static'))
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

  await copyPages(distDir, outDir, buildId)

  // Get the exportPathMap from the config file
  if (typeof nextConfig.exportPathMap !== 'function') {
    console.log(
      `> No "exportPathMap" found in "${CONFIG_FILE}". Generating map from "./pages"`
    )
    nextConfig.exportPathMap = async defaultMap => {
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
    hotReloader: null,
    availableChunks: getAvailableChunks(distDir, false)
  }

  const { serverRuntimeConfig, publicRuntimeConfig } = nextConfig

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

  const progress = new Progress(
    `[:bar] :current/:total :percent :rate/s :etas `,
    {
      total: exportPaths.length
    }
  )

  const chunks = exportPaths.reduce((result, route, i) => {
    const worker = i % threads
    if (!result[worker]) {
      result[worker] = { paths: [], pathMap: {} }
    }
    result[worker].pathMap[route] = exportPathMap[route]
    result[worker].paths.push(route)
    return result
  }, [])

  await Promise.all(
    chunks.map(
      chunk =>
        new Promise((resolve, reject) => {
          const worker = fork(require.resolve('./worker'), [], {
            env: process.env
          })
          worker.send({
            exportPaths: chunk.paths,
            exportPathMap: chunk.pathMap,
            outDir,
            renderOpts,
            concurrency
          })
          worker.on('message', ({ type, payload }) => {
            if (type === 'progress') {
              progress.tick()
            } else if (type === 'error') {
              reject(payload)
            } else if (type === 'done') {
              resolve()
            }
          })
        })
    )
  )

  // Add an empty line to the console for the better readability.
  log('')

  function log (message) {
    if (options.silent) return
    console.log(message)
  }
}

function copyPages (distDir, outDir, buildId) {
  // TODO: do some proper error handling
  return new Promise((resolve, reject) => {
    const nextBundlesDir = join(distDir, 'bundles', 'pages')
    const walker = walk.walk(nextBundlesDir, { followLinks: false })

    walker.on('file', (root, stat, next) => {
      const filename = stat.name
      const fullFilePath = `${root}${sep}${filename}`
      const relativeFilePath = fullFilePath.replace(nextBundlesDir, '')

      // We should not expose this page to the client side since
      // it has no use in the client side.
      if (relativeFilePath === `${sep}_document.js`) {
        next()
        return
      }

      let destFilePath = null
      if (relativeFilePath === `${sep}index.js`) {
        destFilePath = join(outDir, '_next', buildId, 'page', relativeFilePath)
      } else if (/index\.js$/.test(filename)) {
        const newRelativeFilePath = relativeFilePath.replace(
          `${sep}index.js`,
          '.js'
        )
        destFilePath = join(
          outDir,
          '_next',
          buildId,
          'page',
          newRelativeFilePath
        )
      } else {
        destFilePath = join(outDir, '_next', buildId, 'page', relativeFilePath)
      }

      cp(fullFilePath, destFilePath)
        .then(next)
        .catch(reject)
    })

    walker.on('end', resolve)
  })
}

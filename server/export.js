import del from 'del'
import cp from 'recursive-copy'
import mkdirp from 'mkdirp-then'
import walk from 'walk'
import { extname, resolve, join, dirname, sep } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import getConfig from './config'
import {PHASE_EXPORT} from '../lib/constants'
import { renderToHTML } from './render'
import { getAvailableChunks } from './utils'
import { printAndExit } from '../lib/utils'
import { setAssetPrefix } from '../lib/asset'
import * as envConfig from '../lib/runtime-config'

export default async function (dir, options, configuration) {
  dir = resolve(dir)
  const nextConfig = configuration || getConfig(PHASE_EXPORT, dir)
  const nextDir = join(dir, nextConfig.distDir)

  log(`  using build directory: ${nextDir}`)

  if (!existsSync(nextDir)) {
    console.error(
      `Build directory ${nextDir} does not exist. Make sure you run "next build" before running "next start" or "next export".`
    )
    process.exit(1)
  }

  const buildId = readFileSync(join(nextDir, 'BUILD_ID'), 'utf8')

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

  // Copy main.js
  await cp(
    join(nextDir, 'main.js'),
    join(outDir, '_next', buildId, 'main.js')
  )

  // Copy .next/static directory
  if (existsSync(join(nextDir, 'static'))) {
    log('  copying "static build" directory')
    await cp(
      join(nextDir, 'static'),
      join(outDir, '_next', 'static')
    )
  }

  // Copy dynamic import chunks
  if (existsSync(join(nextDir, 'chunks'))) {
    log('  copying dynamic import chunks')

    await mkdirp(join(outDir, '_next', 'webpack'))
    await cp(
      join(nextDir, 'chunks'),
      join(outDir, '_next', 'webpack', 'chunks')
    )
  }

  await copyPages(nextDir, outDir, buildId)

  // Get the exportPathMap from the `next.config.js`
  if (typeof nextConfig.exportPathMap !== 'function') {
    printAndExit(
      '> Could not find "exportPathMap" function inside "next.config.js"\n' +
      '> "next export" uses that function to build html pages.'
    )
  }

  const exportPathMap = await nextConfig.exportPathMap()
  const exportPaths = Object.keys(exportPathMap)

  // Start the rendering process
  const renderOpts = {
    dir,
    dist: nextConfig.distDir,
    buildId,
    nextExport: true,
    assetPrefix: nextConfig.assetPrefix.replace(/\/$/, ''),
    dev: false,
    staticMarkup: false,
    hotReloader: null,
    availableChunks: getAvailableChunks(dir, nextConfig.distDir)
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

  for (const path of exportPaths) {
    log(`  exporting path: ${path}`)
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

function copyPages (nextDir, outDir, buildId) {
  // TODO: do some proper error handling
  return new Promise((resolve, reject) => {
    const nextBundlesDir = join(nextDir, 'bundles', 'pages')
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
        const newRelativeFilePath = relativeFilePath.replace(`${sep}index.js`, '.js')
        destFilePath = join(outDir, '_next', buildId, 'page', newRelativeFilePath)
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

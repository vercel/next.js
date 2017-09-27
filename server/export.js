import del from 'del'
import cp from 'recursive-copy'
import mkdirp from 'mkdirp-then'
import walk from 'walk'
import { resolve, join, dirname, sep } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import getConfig from './config'
import { renderToHTML } from './render'
import { getAvailableChunks } from './utils'
import { printAndExit } from '../lib/utils'

export default async function (dir, options, configuration) {
  dir = resolve(dir)
  const config = configuration || getConfig(dir)
  const nextDir = join(dir, config.distDir)

  log(`  using build directory: ${nextDir}`)

  if (!existsSync(nextDir)) {
    console.error(
      `Build directory ${nextDir} does not exist. Make sure you run "next build" before running "next start" or "next export".`
    )
    process.exit(1)
  }

  const buildId = readFileSync(join(nextDir, 'BUILD_ID'), 'utf8')
  const buildStats = require(join(nextDir, 'build-stats.json'))

  // Initialize the output directory
  const outDir = options.outdir
  await del(join(outDir, '*'))
  await mkdirp(join(outDir, '_next', buildStats['app.js'].hash))
  await mkdirp(join(outDir, '_next', buildId))

  // Copy files
  await cp(
    join(nextDir, 'app.js'),
    join(outDir, '_next', buildStats['app.js'].hash, 'app.js')
  )

  // Copy static directory
  if (existsSync(join(dir, 'static'))) {
    log('  copying "static" directory')
    await cp(
      join(dir, 'static'),
      join(outDir, 'static')
    )
  }

  // Copy dynamic import chunks
  if (existsSync(join(nextDir, 'chunks'))) {
    log('  copying dynamic import chunks')

    await mkdirp(join(outDir, '_next', buildId, 'webpack'))
    await cp(
      join(nextDir, 'chunks'),
      join(outDir, '_next', buildId, 'webpack', 'chunks')
    )
  }

  await copyPages(nextDir, outDir, buildId)

  // Get the exportPathMap from the `next.config.js`
  if (typeof config.exportPathMap !== 'function') {
    printAndExit(
      '> Could not find "exportPathMap" function inside "next.config.js"\n' +
      '> "next export" uses that function to build html pages.'
    )
  }

  const exportPathMap = await config.exportPathMap()
  const exportPaths = Object.keys(exportPathMap)

  // Start the rendering process
  const renderOpts = {
    dir,
    buildStats,
    buildId,
    nextExport: true,
    assetPrefix: config.assetPrefix.replace(/\/$/, ''),
    dev: false,
    staticMarkup: false,
    hotReloader: null,
    availableChunks: getAvailableChunks(dir, config.distDir)
  }

  // We need this for server rendering the Link component.
  global.__NEXT_DATA__ = {
    nextExport: true
  }

  for (const path of exportPaths) {
    log(`  exporting path: ${path}`)

    const { page, query = {} } = exportPathMap[path]
    const req = { url: path }
    const res = {}

    const htmlFilename = path === '/' ? 'index.html' : `${path}${sep}index.html`
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
      if (relativeFilePath === '/_document.js') {
        next()
        return
      }

      let destFilePath = null
      if (/index\.js$/.test(filename)) {
        destFilePath = join(outDir, '_next', buildId, 'page', relativeFilePath)
      } else {
        const newRelativeFilePath = relativeFilePath.replace(/\.js/, `${sep}index.js`)
        destFilePath = join(outDir, '_next', buildId, 'page', newRelativeFilePath)
      }

      cp(fullFilePath, destFilePath)
        .then(next)
        .catch(reject)
    })

    walker.on('end', resolve)
  })
}

import del from 'del'
import cp from 'recursive-copy'
import mkdirp from 'mkdirp-then'
import walk from 'walk'
import { resolve, join, dirname, sep } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import getConfig from './config'
import { renderToHTML } from './render'
import { printAndExit } from '../lib/utils'

export default async function (dir, options) {
  dir = resolve(dir)
  const outDir = options.outdir
  const nextDir = join(dir, '.next')

  if (!existsSync(nextDir)) {
    console.error('Build your with "next build" before running "next start".')
    process.exit(1)
  }

  const config = getConfig(dir)
  const buildId = readFileSync(join(nextDir, 'BUILD_ID'), 'utf8')
  const buildStats = require(join(nextDir, 'build-stats.json'))

  // Initialize the output directory
  await del(outDir)
  await mkdirp(join(outDir, '_next', buildStats['app.js'].hash))
  await mkdirp(join(outDir, '_next', buildId))

  // Copy files
  await cp(
    join(nextDir, 'app.js'),
    join(outDir, '_next', buildStats['app.js'].hash, 'app.js')
  )

  await copyPages(nextDir, outDir, buildId)

  // Get the exportPathMap from the `next.config.js`
  if (typeof config.exportPathMap !== 'function') {
    printAndExit(
      '> Could not found "exportPathMap" function inside "next.config.js"\n' +
      '> "next export" uses that function build html pages.'
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
    hotReloader: null
  }

  // We need this for server rendering the Link component.
  global.__NEXT_DATA__ = {
    nextExport: true
  }

  for (const path of exportPaths) {
    if (options.verbose) {
      console.log(`  exporing path: ${path}`)
    }

    const { page, query } = exportPathMap[path]
    const req = { url: path }
    const res = {}

    const htmlFilename = path === '/' ? 'index.html' : `${path}${sep}index.html`
    const baseDir = join(outDir, dirname(htmlFilename))
    const htmlFilepath = join(outDir, htmlFilename)

    await mkdirp(baseDir)

    const html = await renderToHTML(req, res, page, query, renderOpts)
    writeFileSync(htmlFilepath, html, 'utf8')
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

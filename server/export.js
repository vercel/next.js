import del from 'del'
import cp from 'recursive-copy'
import mkdirp from 'mkdirp-then'
import { resolve, join, dirname, sep } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import getConfig from './config'
import { renderToHTML } from './render'
import { printAndExit } from '../lib/utils'

export default async function (dir) {
  dir = resolve(dir)
  const outDir = join(dir, '.out')
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

  await cp(
    join(nextDir, 'bundles', 'pages'),
    join(outDir, '_next', buildId, 'page')
  )

  // Start the rendering process
  const renderOpts = {
    dir,
    buildStats,
    buildId,
    assetPrefix: config.assetPrefix.replace(/\/$/, ''),
    dev: false,
    staticMarkup: false,
    hotReloader: null
  }

  // Get the exportPathMap from the `next.config.js`
  if (typeof config.exportPathMap !== 'function') {
    printAndExit(
      '> Could not found "exportPathMap" function inside "next.config.js"\n' +
      '> "next export" uses that function build html pages.'
    )
  }

  const exportPathMap = await config.exportPathMap()
  const exportPaths = Object.keys(exportPathMap)

  for (const path of exportPaths) {
    const { page, query } = exportPathMap[path]
    const req = { url: path }
    const res = {}

    const htmlFilename = page === '/' ? 'index.html' : `${page}${sep}index.html`
    const baseDir = join(outDir, dirname(htmlFilename))
    const htmlFilepath = join(outDir, htmlFilename)

    await mkdirp(baseDir)

    const html = await renderToHTML(req, res, page, query, renderOpts)
    writeFileSync(htmlFilepath, html, 'utf8')
  }
}

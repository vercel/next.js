global.__NEXT_DATA__ = {
  nextExport: true
}

const { extname, join, dirname, sep } = require('path')
const mkdirp = require('mkdirp-then')
const { renderToHTML } = require('next-server/dist/server/render')
const { writeFile } = require('fs')
const Sema = require('async-sema')
const {loadComponents} = require('next-server/dist/server/load-components')
const envConfig = require('next-server/config')

process.on(
  'message',
  async ({
    distDir,
    buildId,
    exportPaths,
    exportPathMap,
    outDir,
    renderOpts,
    serverRuntimeConfig,
    concurrency
  }) => {
    const sema = new Sema(concurrency, { capacity: exportPaths.length })
    try {
      const work = async path => {
        await sema.acquire()
        const { page, query = {} } = exportPathMap[path]
        const req = { url: path }
        const res = {}
        envConfig.setConfig({
          serverRuntimeConfig,
          publicRuntimeConfig: renderOpts.runtimeConfig
        })

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
        const components = await loadComponents(distDir, buildId, page)
        const html = await renderToHTML(req, res, page, query, {...components, ...renderOpts})
        await new Promise((resolve, reject) =>
          writeFile(
            htmlFilepath,
            html,
            'utf8',
            err => (err ? reject(err) : resolve())
          )
        )
        process.send({ type: 'progress' })
        sema.release()
      }
      await Promise.all(exportPaths.map(work))
      process.send({ type: 'done' })
    } catch (err) {
      console.error(err)
      process.send({ type: 'error', payload: err })
    }
  }
)

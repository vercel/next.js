import mkdirpModule from 'mkdirp'
import { promisify } from 'util'
import { extname, join, dirname, sep } from 'path'
import { cleanAmpPath } from 'next-server/dist/server/utils'
import { renderToHTML } from 'next-server/dist/server/render'
import { writeFile } from 'fs'
import Sema from 'async-sema'
import AmpHtmlValidator from 'amphtml-validator'
import { loadComponents } from 'next-server/dist/server/load-components'

const envConfig = require('next-server/config')
const mkdirp = promisify(mkdirpModule)

global.__NEXT_DATA__ = {
  nextExport: true
}

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
        const ampOpts = { amphtml: query.amphtml, hasAmp: query.hasAmp, ampPath: query.ampPath }
        const ampOnly = query.ampOnly
        delete query.ampOnly
        delete query.hasAmp
        delete query.ampPath
        delete query.amphtml

        const req = { url: path }
        const res = {}
        envConfig.setConfig({
          serverRuntimeConfig,
          publicRuntimeConfig: renderOpts.runtimeConfig
        })

        if (ampOnly) {
          path = cleanAmpPath(path)
          ampOpts.ampPath = path + '.amp'
        }

        // replace /docs/index.amp with /docs.amp
        path = path.replace(/(?<!^)\/index\.amp$/, '.amp')

        let htmlFilename = `${path}${sep}index.html`
        const pageExt = extname(page)
        const pathExt = extname(path)
        // Make sure page isn't a folder with a dot in the name e.g. `v1.2`
        if (pageExt !== pathExt && pathExt !== '') {
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
        const html = await renderToHTML(req, res, page, query, { ...components, ...renderOpts, ...ampOpts })

        if (ampOpts.amphtml && query.amp) {
          const validator = await AmpHtmlValidator.getInstance()
          const result = validator.validateString(html)
          const errors = result.errors.filter(e => e.severity === 'ERROR')
          const warnings = result.errors.filter(e => e.severity !== 'ERROR')

          if (warnings.length || errors.length) {
            process.send({
              type: 'amp-validation',
              payload: {
                page,
                result: {
                  errors,
                  warnings
                }
              }
            })
          }
        }

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

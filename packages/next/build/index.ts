import { join } from 'path'
import nanoid from 'nanoid'
import loadConfig from 'next-server/next-config'
import { PHASE_PRODUCTION_BUILD } from 'next-server/constants'
import getBaseWebpackConfig from './webpack-config'
import {generateBuildId} from './generate-build-id'
import {writeBuildId} from './write-build-id'
import {isWriteable} from './is-writeable'
import {runCompiler, CompilerResult} from './compiler'
import globModule from 'glob'
import {promisify} from 'util'
import {stringify} from 'querystring'

const glob = promisify(globModule)

function collectPages (directory: string, pageExtensions: string[]): Promise<string[]> {
  return glob(`**/*.+(${pageExtensions.join('|')})`, {cwd: directory})
}

export default async function build (dir: string, conf = null, target: string|null = null): Promise<void> {
  if (!await isWriteable(dir)) {
    throw new Error('> Build directory is not writeable. https://err.sh/zeit/next.js/build-dir-not-writeable')
  }

  const config = loadConfig(PHASE_PRODUCTION_BUILD, dir, conf)
  const actualTarget = target || config.target || 'server' // default to `server` when target is not defined in any way
  const buildId = await generateBuildId(config.generateBuildId, nanoid)
  const distDir = join(dir, config.distDir)
  const pagesDir = join(dir, 'pages')

  const pagePaths = await collectPages(pagesDir, config.pageExtensions)
  type Result = {[page: string]: string}
  const pages: Result = pagePaths.reduce((result: Result, pagePath): Result => {
    let page = `/${pagePath.replace(new RegExp(`\\.+(${config.pageExtensions.join('|')})$`), '').replace(/\\/g, '/')}`.replace(/\/index$/, '')
    page = page === '' ? '/' : page
    result[page] = pagePath
    return result
  }, {})

  let entrypoints
  if (actualTarget === 'serverless') {
    const serverlessEntrypoints: any = {}
    // Because on Windows absolute paths in the generated code can break because of numbers, eg 1 in the path,
    // we have to use a private alias
    const pagesDirAlias = 'private-next-pages'
    const dotNextDirAlias = 'private-dot-next'
    const absoluteAppPath = pages['/_app'] ? join(pagesDirAlias, pages['/_app']).replace(/\\/g, '/') : 'next/dist/pages/_app'
    const absoluteDocumentPath = pages['/_document'] ? join(pagesDirAlias, pages['/_document']).replace(/\\/g, '/') : 'next/dist/pages/_document'
    const absoluteErrorPath = pages['/_error'] ? join(pagesDirAlias, pages['/_error']).replace(/\\/g, '/') : 'next/dist/pages/_error'
    Object.keys(pages).forEach(async (page) => {
      if (page === '/_app' || page === '/_document') {
        return
      }

      const absolutePagePath = join(pagesDirAlias, pages[page]).replace(/\\/g, '/')
      const bundleFile = page === '/' ? '/index.js' : `${page}.js`
      const query = stringify({
        page,
        absolutePagePath,
        absoluteAppPath,
        absoluteDocumentPath,
        absoluteErrorPath,
        distDir: dotNextDirAlias,
        buildId,
        assetPrefix: config.assetPrefix,
        generateEtags: config.generateEtags
      })
      serverlessEntrypoints[join('pages', bundleFile)] = `next-serverless-loader?${query}!`
    })

    entrypoints = serverlessEntrypoints
  }

  const configs: any = await Promise.all([
    getBaseWebpackConfig(dir, { buildId, isServer: false, config, target: actualTarget }),
    getBaseWebpackConfig(dir, { buildId, isServer: true, config, target: actualTarget, entrypoints })
  ])

  let result: CompilerResult = {warnings: [], errors: []}
  if (actualTarget === 'serverless') {
    const clientResult = await runCompiler([configs[0]])
    const serverResult = await runCompiler([configs[1]])
    result = {warnings: [...clientResult.warnings, ...serverResult.warnings], errors: [...clientResult.errors, ...serverResult.errors]}
  } else {
    result = await runCompiler(configs)
  }

  if (result.warnings.length > 0) {
    console.warn('> Emitted warnings from webpack')
    result.warnings.forEach((warning) => console.warn(warning))
  }

  if (result.errors.length > 0) {
    result.errors.forEach((error) => console.error(error))
    throw new Error('> Build failed because of webpack errors')
  }
  await writeBuildId(distDir, buildId)
}

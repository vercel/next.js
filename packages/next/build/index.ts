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
import {ServerlessLoaderQuery} from './webpack/loaders/next-serverless-loader'

const glob = promisify(globModule)

function collectPages (directory: string, pageExtensions: string[]): Promise<string[]> {
  return glob(`**/*.+(${pageExtensions.join('|')})`, {cwd: directory})
}

export default async function build (dir: string, conf = null): Promise<void> {
  if (!await isWriteable(dir)) {
    throw new Error('> Build directory is not writeable. https://err.sh/zeit/next.js/build-dir-not-writeable')
  }

  const config = loadConfig(PHASE_PRODUCTION_BUILD, dir, conf)
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
  if (config.target === 'serverless') {
    const serverlessEntrypoints: any = {}
    // Because on Windows absolute paths in the generated code can break because of numbers, eg 1 in the path,
    // we have to use a private alias
    const pagesDirAlias = 'private-next-pages'
    const dotNextDirAlias = 'private-dot-next'
    const absoluteAppPath = pages['/_app'] ? join(pagesDirAlias, pages['/_app']).replace(/\\/g, '/') : 'next/dist/pages/_app'
    const absoluteDocumentPath = pages['/_document'] ? join(pagesDirAlias, pages['/_document']).replace(/\\/g, '/') : 'next/dist/pages/_document'
    const absoluteErrorPath = pages['/_error'] ? join(pagesDirAlias, pages['/_error']).replace(/\\/g, '/') : 'next/dist/pages/_error'

    const defaultOptions = {
      absoluteAppPath,
      absoluteDocumentPath,
      absoluteErrorPath,
      distDir: dotNextDirAlias,
      buildId,
      assetPrefix: config.assetPrefix,
      generateEtags: config.generateEtags
    }

    Object.keys(pages).forEach(async (page) => {
      if (page === '/_app' || page === '/_document') {
        return
      }

      const absolutePagePath = join(pagesDirAlias, pages[page]).replace(/\\/g, '/')
      const bundleFile = page === '/' ? '/index.js' : `${page}.js`
      const serverlessLoaderOptions: ServerlessLoaderQuery = {page, absolutePagePath, ...defaultOptions}
      serverlessEntrypoints[join('pages', bundleFile)] = `next-serverless-loader?${stringify(serverlessLoaderOptions)}!`
    })

    const errorPage = join('pages', '/_error.js')
    if (!serverlessEntrypoints[errorPage]) {
      const serverlessLoaderOptions: ServerlessLoaderQuery = {page: '/_error', absolutePagePath: 'next/dist/pages/_error', ...defaultOptions}
      serverlessEntrypoints[errorPage] = `next-serverless-loader?${stringify(serverlessLoaderOptions)}!`
    }

    entrypoints = serverlessEntrypoints
  }

  const configs: any = await Promise.all([
    getBaseWebpackConfig(dir, { buildId, isServer: false, config, target: config.target }),
    getBaseWebpackConfig(dir, { buildId, isServer: true, config, target: config.target, entrypoints })
  ])

  let result: CompilerResult = {warnings: [], errors: []}
  if (config.target === 'serverless') {
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

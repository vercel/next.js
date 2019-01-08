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
import {PAGES_DIR_ALIAS, DOT_NEXT_ALIAS} from '../lib/constants'

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
    result[page] = join(PAGES_DIR_ALIAS, pagePath).replace(/\\/g, '/')
    return result
  }, {})

  const absoluteAppPath = pages['/_app'] ? pages['/_app'] : 'next/dist/pages/_app.js'
  const absoluteDocumentPath = pages['/_document'] ? pages['/_document'] : 'next/dist/pages/_document.js'
  const absoluteErrorPath = pages['/_error'] ? pages['/_error'] : 'next/dist/pages/_error.js'

  pages['/_app'] = absoluteAppPath
  pages['/_document'] = absoluteDocumentPath
  pages['/_error'] = absoluteErrorPath


  const defaultServerlessOptions = {
    absoluteAppPath,
    absoluteDocumentPath,
    absoluteErrorPath,
    distDir: DOT_NEXT_ALIAS,
    buildId,
    assetPrefix: config.assetPrefix,
    generateEtags: config.generateEtags
  }

  const serverEntrypoints: any = {}
  const clientEntrypoints: any = {}

  Object.keys(pages).forEach((page) => {
    const absolutePagePath = pages[page]
    const bundleFile = page === '/' ? '/index.js' : `${page}.js`
    if(config.target === 'serverless') {
      if(page !== '/_app' && page !== '/_document') {
        const serverlessLoaderOptions: ServerlessLoaderQuery = {page, absolutePagePath, ...defaultServerlessOptions}
        serverEntrypoints[join('pages', bundleFile)] = `next-serverless-loader?${stringify(serverlessLoaderOptions)}!`
      }
      
    } else if (config.target === 'server') {
      serverEntrypoints[join('static', buildId, 'pages', bundleFile)] = [absolutePagePath]
    }

    if(page === '/_document') {
      return
    }

    const clientPagesLoaderOptions = {page, absolutePagePath}
    clientEntrypoints[join('static', buildId, 'pages', bundleFile)] = `next-client-pages-loader?${stringify(clientPagesLoaderOptions)}!`
  })

  const configs: any = await Promise.all([
    getBaseWebpackConfig(dir, { buildId, isServer: false, config, target: config.target, entrypoints: clientEntrypoints }),
    getBaseWebpackConfig(dir, { buildId, isServer: true, config, target: config.target, entrypoints: serverEntrypoints })
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

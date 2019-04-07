import path from 'path'
import fs from 'fs'
import nanoid from 'next/dist/compiled/nanoid/index.js'
import loadConfig from 'next-server/next-config'
import { PHASE_PRODUCTION_BUILD } from 'next-server/constants'
import getBaseWebpackConfig from './webpack-config'
import { generateBuildId } from './generate-build-id'
import { writeBuildId } from './write-build-id'
import { isWriteable } from './is-writeable'
import { runCompiler, CompilerResult } from './compiler'
import { recursiveReadDir } from '../lib/recursive-readdir'
import { createPagesMapping, createEntrypoints } from './entries'
import formatWebpackMessages from '../client/dev-error-overlay/format-webpack-messages'
import chalk from 'chalk'

function collectPages(
  directory: string,
  pageExtensions: string[]
): Promise<string[]> {
  return recursiveReadDir(
    directory,
    new RegExp(`\\.(?:${pageExtensions.join('|')})$`)
  )
}

function printTreeView(list: string[]) {
  list
    .sort((a, b) => (a > b ? 1 : -1))
    .forEach((item, i) => {
      const corner =
        i === 0
          ? list.length === 1
            ? '─'
            : '┌'
          : i === list.length - 1
          ? '└'
          : '├'
      console.log(` \x1b[90m${corner}\x1b[39m ${item}`)
    })

  console.log()
}

function flatten<T>(arr: T[][]): T[] {
  return arr.reduce((acc, val) => acc.concat(val), [] as T[])
}

function getPossibleFiles(pageExtensions: string[], pages: string[]) {
  const res = pages.map(page =>
    [page]
      .concat(pageExtensions.map(e => `${page}.${e}`))
      .concat(pageExtensions.map(e => `${path.join(page, 'index')}.${e}`))
  )
  return flatten<string>(res)
}

export async function getSpecifiedPages(
  dir: string,
  pages: string[],
  pageExtensions: string[]
) {
  const pagesDir = path.join(dir, 'pages')

  const reservedPages = ['/_app', '/_document', '/_error']
  pages.push(...reservedPages)

  const searchAllPages = pages.some(p => p.includes('**'))

  let pagePaths: string[]
  const explodedPages = [
    ...new Set(
      flatten<string>(pages.map(p => p.split(',').filter(p => p !== '**')))
    ),
  ].map(p => {
    let removePage = false
    if (p.startsWith('-')) {
      p = p.substring(1)
      removePage = true
    }

    let resolvedPage: string | undefined
    if (path.isAbsolute(p)) {
      resolvedPage = getPossibleFiles(pageExtensions, [
        path.join(pagesDir, p),
        p,
      ]).find(f => fs.existsSync(f) && fs.lstatSync(f).isFile())
    } else {
      resolvedPage = getPossibleFiles(pageExtensions, [
        path.join(pagesDir, p),
        path.join(dir, p),
      ]).find(f => fs.existsSync(f) && fs.lstatSync(f).isFile())
    }
    return { original: p, resolved: resolvedPage || null, removePage }
  })

  const missingPage = explodedPages.find(
    ({ original, resolved }) => !resolved && !reservedPages.includes(original)
  )
  if (missingPage) {
    throw new Error(`Unable to identify page: ${missingPage.original}`)
  }
  const resolvedPagePaths = explodedPages
    .filter(page => page.resolved)
    .map(page => ({
      ignore: page.removePage,
      pathname: '/' + path.relative(pagesDir, page.resolved!),
    }))

  if (searchAllPages) {
    const pageSet = new Set(await collectPages(pagesDir, pageExtensions))

    resolvedPagePaths
      .filter(p => p.ignore)
      .forEach(p => pageSet.delete(p.pathname))

    pagePaths = [...pageSet]
  } else {
    pagePaths = resolvedPagePaths.filter(p => !p.ignore).map(p => p.pathname)
  }

  return pagePaths.sort()
}

export default async function build(
  dir: string,
  conf = null,
  { pages: _pages = [] as string[] } = {}
): Promise<void> {
  if (!(await isWriteable(dir))) {
    throw new Error(
      '> Build directory is not writeable. https://err.sh/zeit/next.js/build-dir-not-writeable'
    )
  }

  const debug =
    process.env.__NEXT_BUILDER_EXPERIMENTAL_DEBUG === 'true' ||
    process.env.__NEXT_BUILDER_EXPERIMENTAL_DEBUG === '1'

  console.log(
    debug
      ? 'Creating a development build ...'
      : 'Creating an optimized production build ...'
  )
  console.log()

  const config = loadConfig(PHASE_PRODUCTION_BUILD, dir, conf)
  const buildId = debug
    ? 'unoptimized-build'
    : await generateBuildId(config.generateBuildId, nanoid)
  const distDir = path.join(dir, config.distDir)
  const pagesDir = path.join(dir, 'pages')

  const pages =
    Array.isArray(_pages) && _pages.length
      ? _pages
      : process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE
      ? [process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE]
      : []

  const __selectivePageBuilding = pages ? Boolean(pages.length) : false

  if (__selectivePageBuilding && config.target !== 'serverless') {
    throw new Error(
      'Cannot use selective page building without the serverless target.'
    )
  }

  let pagePaths
  if (__selectivePageBuilding) {
    pagePaths = await getSpecifiedPages(dir, pages, config.pageExtensions)
  } else {
    pagePaths = await collectPages(pagesDir, config.pageExtensions)
  }
  const mappedPages = createPagesMapping(pagePaths, config.pageExtensions)
  const entrypoints = createEntrypoints(
    mappedPages,
    config.target,
    buildId,
    __selectivePageBuilding,
    config
  )
  const configs = await Promise.all([
    getBaseWebpackConfig(dir, {
      debug,
      buildId,
      isServer: false,
      config,
      target: config.target,
      entrypoints: entrypoints.client,
      __selectivePageBuilding,
    }),
    getBaseWebpackConfig(dir, {
      debug,
      buildId,
      isServer: true,
      config,
      target: config.target,
      entrypoints: entrypoints.server,
      __selectivePageBuilding,
    }),
  ])

  let result: CompilerResult = { warnings: [], errors: [] }
  if (config.target === 'serverless') {
    if (config.publicRuntimeConfig)
      throw new Error(
        'Cannot use publicRuntimeConfig with target=serverless https://err.sh/zeit/next.js/serverless-publicRuntimeConfig'
      )

    const clientResult = await runCompiler(configs[0])
    // Fail build if clientResult contains errors
    if (clientResult.errors.length > 0) {
      result = {
        warnings: [...clientResult.warnings],
        errors: [...clientResult.errors],
      }
    } else {
      const serverResult = await runCompiler(configs[1])
      result = {
        warnings: [...clientResult.warnings, ...serverResult.warnings],
        errors: [...clientResult.errors, ...serverResult.errors],
      }
    }
  } else {
    result = await runCompiler(configs)
  }

  result = formatWebpackMessages(result)

  if (result.errors.length > 0) {
    // Only keep the first error. Others are often indicative
    // of the same problem, but confuse the reader with noise.
    if (result.errors.length > 1) {
      result.errors.length = 1
    }
    const error = result.errors.join('\n\n')

    console.error(chalk.red('Failed to compile.\n'))
    console.error(error)
    console.error()

    if (error.indexOf('private-next-pages') > -1) {
      throw new Error(
        '> webpack config.resolve.alias was incorrectly overriden. https://err.sh/zeit/next.js/invalid-resolve-alias'
      )
    }
    throw new Error('> Build failed because of webpack errors')
  } else if (result.warnings.length > 0) {
    console.warn(chalk.yellow('Compiled with warnings.\n'))
    console.warn(result.warnings.join('\n\n'))
    console.warn()
  } else {
    console.log(chalk.green('Compiled successfully.\n'))
  }

  printTreeView(Object.keys(mappedPages))

  await writeBuildId(distDir, buildId, __selectivePageBuilding)
}

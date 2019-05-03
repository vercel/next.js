import chalk from 'chalk'
import {
  CHUNK_GRAPH_MANIFEST,
  PHASE_PRODUCTION_BUILD,
} from 'next-server/constants'
import loadConfig from 'next-server/next-config'
import nanoid from 'next/dist/compiled/nanoid/index.js'
import path from 'path'
import fs from 'fs'

import formatWebpackMessages from '../client/dev-error-overlay/format-webpack-messages'
import { recursiveDelete } from '../lib/recursive-delete'
import { CompilerResult, runCompiler } from './compiler'
import { createEntrypoints, createPagesMapping } from './entries'
import { FlyingShuttle } from './flying-shuttle'
import { generateBuildId } from './generate-build-id'
import { isWriteable } from './is-writeable'
import {
  collectPages,
  getCacheIdentifier,
  getFileForPage,
  getSpecifiedPages,
  printTreeView,
  getPageInfo,
} from './utils'
import getBaseWebpackConfig from './webpack-config'
import { exportManifest, getPageChunks } from './webpack/plugins/chunk-graph-plugin'
import { writeBuildId } from './write-build-id'
import { recursiveReadDir } from '../lib/recursive-readdir'
import { usedBabelCacheFiles } from './webpack/loaders/next-babel-loader/cache'
import { promisify } from  'util'

const unlink = promisify(fs.unlink)

export default async function build(dir: string, conf = null): Promise<void> {
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
  const target = process.env.__NEXT_BUILDER_EXPERIMENTAL_TARGET || config.target
  const buildId = debug
    ? 'unoptimized-build'
    : await generateBuildId(config.generateBuildId, nanoid)
  const distDir = path.join(dir, config.distDir)
  const pagesDir = path.join(dir, 'pages')

  const isFlyingShuttle = Boolean(
    config.experimental.flyingShuttle &&
      !process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE
  )
  const selectivePageBuilding = Boolean(
    isFlyingShuttle || process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE
  )

  if (selectivePageBuilding && target !== 'serverless') {
    throw new Error(
      `Cannot use ${
        isFlyingShuttle ? 'flying shuttle' : '`now dev`'
      } without the serverless target.`
    )
  }

  const selectivePageBuildingCacheIdentifier = selectivePageBuilding
    ? await getCacheIdentifier({
        pagesDirectory: pagesDir,
        env: config.env || {},
      })
    : 'noop'

  let flyingShuttle: FlyingShuttle | undefined
  if (isFlyingShuttle) {
    console.log(chalk.magenta('Building with Flying Shuttle enabled ...'))
    console.log()

    await recursiveDelete(distDir, /^(?!cache(?:[\/\\]|$)).*$/)
    await recursiveDelete(path.join(distDir, 'cache', 'next-minifier'))

    flyingShuttle = new FlyingShuttle({
      buildId,
      pagesDirectory: pagesDir,
      distDirectory: distDir,
      cacheIdentifier: selectivePageBuildingCacheIdentifier,
    })
  }

  let pagePaths: string[]
  if (process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE) {
    pagePaths = await getSpecifiedPages(
      dir,
      process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE!,
      config.pageExtensions
    )
  } else {
    pagePaths = await collectPages(pagesDir, config.pageExtensions)
  }

  if (flyingShuttle && (await flyingShuttle.hasShuttle())) {
    const _unchangedPages = new Set(await flyingShuttle.getUnchangedPages())
    for (const unchangedPage of _unchangedPages) {
      const recalled = await flyingShuttle.restorePage(unchangedPage)
      if (recalled) {
        continue
      }

      _unchangedPages.delete(unchangedPage)
    }

    const unchangedPages = await Promise.all(
      [..._unchangedPages].map(async page => {
        const file = await getFileForPage({
          page,
          pagesDirectory: pagesDir,
          pageExtensions: config.pageExtensions,
        })
        if (file) {
          return file
        }

        return Promise.reject(
          new Error(
            `Failed to locate page file: ${page}. ` +
              `Did pageExtensions change? We can't recover from this yet.`
          )
        )
      })
    )

    const pageSet = new Set(pagePaths)
    for (const unchangedPage of unchangedPages) {
      pageSet.delete(unchangedPage)
    }
    pagePaths = [...pageSet]
  }

  const mappedPages = createPagesMapping(pagePaths, config.pageExtensions)
  const entrypoints = createEntrypoints(
    mappedPages,
    target,
    buildId,
    /* dynamicBuildId */ selectivePageBuilding,
    config
  )
  const configs = await Promise.all([
    getBaseWebpackConfig(dir, {
      debug,
      buildId,
      isServer: false,
      config,
      target,
      entrypoints: entrypoints.client,
      selectivePageBuilding,
    }),
    getBaseWebpackConfig(dir, {
      debug,
      buildId,
      isServer: true,
      config,
      target,
      entrypoints: entrypoints.server,
      selectivePageBuilding,
    }),
  ])

  let result: CompilerResult = { warnings: [], errors: [] }
  if (target === 'serverless') {
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

  if (isFlyingShuttle) {
    console.log()

    exportManifest({
      dir: dir,
      fileName: path.join(distDir, CHUNK_GRAPH_MANIFEST),
      selectivePageBuildingCacheIdentifier,
    })
  }

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

  const pageInfos = new Map()
  const distPath = path.join(dir, config.distDir)
  let pageKeys = Object.keys(mappedPages)

  for (const page of pageKeys) {
    const chunks = getPageChunks(page)
    const actualPage = page === '/' ? 'index' : page
    const info = await getPageInfo(
      actualPage,
      distPath,
      buildId,
      false,
      config.target === 'serverless'
    )

    pageInfos.set(page, {
      ...(info || {}),
      chunks
    })

    if (!(typeof info.serverSize === 'number')) {
      pageKeys = pageKeys.filter(pg => pg !== page)
    }
  }

  if (Array.isArray(configs[0].plugins)) {
    configs[0].plugins.some((plugin: any) => {
      if (plugin.ampPages) {
        plugin.ampPages.forEach((pg: any) => {
          const info = pageInfos.get(pg)
          if (info) {
            info.ampOnly = true
            pageInfos.set(pg, info)
          }
        })
      }
      return Boolean(plugin.ampPages)
    })
  }

  printTreeView(pageKeys, pageInfos)

  if (flyingShuttle) {
    await flyingShuttle.save()
  }

  // to prevent persisted caches from growing massively
  // we clear un-used files
  const babelCacheDir = path.join(distDir, 'cache/next-babel-loader')
  let babelCacheToClear = (await recursiveReadDir(babelCacheDir, /.*\.js/))
    .map(file => path.join(babelCacheDir, file))

  babelCacheToClear = babelCacheToClear.filter((file: string) => {
    return !usedBabelCacheFiles.has(file)
  })

  for (const file of babelCacheToClear) {
    await unlink(file)
  }

  await writeBuildId(distDir, buildId, selectivePageBuilding)
}

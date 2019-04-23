import chalk from 'chalk'
import { PHASE_PRODUCTION_BUILD, BLOCKED_PAGES } from 'next-server/constants'
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
} from './utils'
import getBaseWebpackConfig from './webpack-config'
import { writeBuildId } from './write-build-id'

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

  if (selectivePageBuilding && config.target !== 'serverless') {
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
    config.target,
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
      target: config.target,
      selectivePageBuildingCacheIdentifier,
      entrypoints: entrypoints.client,
      selectivePageBuilding,
    }),
    getBaseWebpackConfig(dir, {
      debug,
      buildId,
      isServer: true,
      config,
      target: config.target,
      selectivePageBuildingCacheIdentifier,
      entrypoints: entrypoints.server,
      selectivePageBuilding,
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

  if (isFlyingShuttle) {
    console.log()
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

  let ampPages = new Set()

  if (Array.isArray(configs[0].plugins)) {
    configs[0].plugins.some((plugin: any) => {
      if (plugin.ampPages) ampPages = plugin.ampPages
      return Boolean(plugin.ampPages)
    })
  }

  printTreeView(Object.keys(mappedPages), ampPages)

  if (flyingShuttle) {
    await flyingShuttle.save()
  }

  await writeBuildId(distDir, buildId, selectivePageBuilding)
}

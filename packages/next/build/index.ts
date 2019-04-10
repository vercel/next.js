import path from 'path'
import nanoid from 'next/dist/compiled/nanoid/index.js'
import loadConfig from 'next-server/next-config'
import { PHASE_PRODUCTION_BUILD } from 'next-server/constants'
import getBaseWebpackConfig from './webpack-config'
import { generateBuildId } from './generate-build-id'
import { writeBuildId } from './write-build-id'
import { isWriteable } from './is-writeable'
import { runCompiler, CompilerResult } from './compiler'
import { createPagesMapping, createEntrypoints } from './entries'
import formatWebpackMessages from '../client/dev-error-overlay/format-webpack-messages'
import chalk from 'chalk'
import { collectPages, printTreeView, getSpecifiedPages } from './utils'

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

  const flyingShuttle = Boolean(config.experimental.flyingShuttle)
  const selectivePageBuilding = Boolean(
    flyingShuttle || process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE
  )

  if (selectivePageBuilding && config.target !== 'serverless') {
    throw new Error(
      `Cannot use ${
        flyingShuttle ? 'flying shuttle' : '`now dev`'
      } without the serverless target.`
    )
  }

  let pagePaths
  if (process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE) {
    pagePaths = await getSpecifiedPages(
      dir,
      process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE!,
      config.pageExtensions
    )
  } else {
    pagePaths = await collectPages(pagesDir, config.pageExtensions)
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
      entrypoints: entrypoints.client,
      selectivePageBuilding,
    }),
    getBaseWebpackConfig(dir, {
      debug,
      buildId,
      isServer: true,
      config,
      target: config.target,
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

  await writeBuildId(distDir, buildId, selectivePageBuilding)
}

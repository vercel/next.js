import { join } from 'path'
import nanoid from 'nanoid'
import loadConfig from 'next-server/next-config'
import { PHASE_PRODUCTION_BUILD } from 'next-server/constants'
import getBaseWebpackConfig from './webpack-config'
import { generateBuildId } from './generate-build-id'
import { writeBuildId } from './write-build-id'
import { isWriteable } from './is-writeable'
import { runCompiler, CompilerResult } from './compiler'
import globModule from 'glob'
import { promisify } from 'util'
import { createPagesMapping, createEntrypoints } from './entries'
import formatWebpackMessages from '../client/dev-error-overlay/format-webpack-messages'
import chalk from 'chalk'

const glob = promisify(globModule)

function collectPages(
  directory: string,
  pageExtensions: string[]
): Promise<string[]> {
  return glob(`**/*.+(${pageExtensions.join('|')})`, { cwd: directory })
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

export default async function build(dir: string, conf = null): Promise<void> {
  if (!(await isWriteable(dir))) {
    throw new Error(
      '> Build directory is not writeable. https://err.sh/zeit/next.js/build-dir-not-writeable'
    )
  }

  console.log('Creating an optimized production build ...')
  console.log()

  const config = loadConfig(PHASE_PRODUCTION_BUILD, dir, conf)
  const buildId = await generateBuildId(config.generateBuildId, nanoid)
  const distDir = join(dir, config.distDir)
  const pagesDir = join(dir, 'pages')

  const pagePaths = await collectPages(pagesDir, config.pageExtensions)
  const pages = createPagesMapping(pagePaths, config.pageExtensions)
  const entrypoints = createEntrypoints(pages, config.target, buildId, config)
  const configs: any = await Promise.all([
    getBaseWebpackConfig(dir, {
      buildId,
      isServer: false,
      config,
      target: config.target,
      entrypoints: entrypoints.client,
    }),
    getBaseWebpackConfig(dir, {
      buildId,
      isServer: true,
      config,
      target: config.target,
      entrypoints: entrypoints.server,
    }),
  ])

  let result: CompilerResult = { warnings: [], errors: [] }
  if (config.target === 'serverless') {
    if (config.publicRuntimeConfig)
      throw new Error(
        'Cannot use publicRuntimeConfig with target=serverless https://err.sh/zeit/next.js/serverless-publicRuntimeConfig'
      )

    const clientResult = await runCompiler([configs[0]])
    // Fail build if clientResult contains errors
    if (clientResult.errors.length > 0) {
      result = {
        warnings: [...clientResult.warnings],
        errors: [...clientResult.errors],
      }
    } else {
      const serverResult = await runCompiler([configs[1]])
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

    console.error(chalk.red('Failed to compile.\n'))
    console.error(result.errors.join('\n\n'))
    console.error()
    throw new Error('> Build failed because of webpack errors')
  } else if (result.warnings.length > 0) {
    console.warn(chalk.yellow('Compiled with warnings.\n'))
    console.warn(result.warnings.join('\n\n'))
    console.warn()
  } else {
    console.log(chalk.green('Compiled successfully.\n'))
  }

  printTreeView(Object.keys(pages))

  await writeBuildId(distDir, buildId)
}

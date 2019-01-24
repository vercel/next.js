import { join } from 'path'
import nanoid from 'nanoid'
import loadConfig from 'next-server/next-config'
import { PHASE_PRODUCTION_BUILD } from '../lib/constants'
import getBaseWebpackConfig from './webpack-config'
import {generateBuildId} from './generate-build-id'
import {writeBuildId} from './write-build-id'
import {isWriteable} from './is-writeable'
import {runCompiler, CompilerResult} from './compiler'
import globModule from 'glob'
import {promisify} from 'util'
import {createPagesMapping, createEntrypoints} from './entries'

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
  const pages = createPagesMapping(pagePaths, config.pageExtensions)
  const entrypoints = createEntrypoints(pages, config.target, buildId, config)
  const configs: any = await Promise.all([
    getBaseWebpackConfig(dir, { buildId, isServer: false, config, target: config.target, entrypoints: entrypoints.client }),
    getBaseWebpackConfig(dir, { buildId, isServer: true, config, target: config.target, entrypoints: entrypoints.server })
  ])

  let result: CompilerResult = {warnings: [], errors: []}
  if (config.target === 'serverless') {
    const clientResult = await runCompiler([configs[0]])
    // Fail build if clientResult contains errors
    if(clientResult.errors.length > 0) {
      result = {warnings: [...clientResult.warnings], errors: [...clientResult.errors]}
    } else {
      const serverResult = await runCompiler([configs[1]])
      result = {warnings: [...clientResult.warnings, ...serverResult.warnings], errors: [...clientResult.errors, ...serverResult.errors]}
    }
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

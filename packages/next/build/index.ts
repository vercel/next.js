import { join } from 'path'
import nanoid from 'nanoid'
import loadConfig from 'next-server/next-config'
import { PHASE_PRODUCTION_BUILD } from 'next-server/constants'
import getBaseWebpackConfig from './webpack-config'
import {generateBuildId} from './generate-build-id'
import {writeBuildId} from './write-build-id'
import {isWriteable} from './is-writeable'
import {runCompiler} from './compiler'

export default async function build (dir: string, conf = null, lambdas: boolean = false): Promise<void> {
  if (!await isWriteable(dir)) {
    throw new Error('> Build directory is not writeable. https://err.sh/zeit/next.js/build-dir-not-writeable')
  }

  const config = loadConfig(PHASE_PRODUCTION_BUILD, dir, conf)
  const lambdasOption = config.lambdas ? config.lambdas : lambdas
  const distDir = join(dir, config.distDir)
  const buildId = await generateBuildId(config.generateBuildId, nanoid)
  const configs: any = await Promise.all([
    getBaseWebpackConfig(dir, { buildId, isServer: false, config, lambdas: lambdasOption }),
    getBaseWebpackConfig(dir, { buildId, isServer: true, config, lambdas: lambdasOption })
  ])

  const result = await runCompiler(configs)
  if (result.warnings.length > 0) {
    console.warn('> Emitted warnings from webpack')
    console.warn(...result.warnings)
  }

  if (result.errors.length > 0) {
    console.error(...result.errors)
    throw new Error('> Build failed because of webpack errors')
  }
  await writeBuildId(distDir, buildId)
}

import { join } from 'path'
import webpack from 'webpack'
import nanoid from 'nanoid'
import loadConfig from 'next-server/next-config'
import { PHASE_PRODUCTION_BUILD } from 'next-server/constants'
import getBaseWebpackConfig from './webpack'
import {generateBuildId} from './generate-build-id'
import {writeBuildId} from './write-build-id'
import {isWriteable} from './is-writeable'

export default async function build (dir, conf = null, lambdas = false) {
  if (!await isWriteable(dir)) {
    throw new Error('Build directory is not writeable. https://err.sh/zeit/next.js/build-dir-not-writeable')
  }

  const config = loadConfig(PHASE_PRODUCTION_BUILD, dir, conf)
  const lambdasOption = config.lambdas ? config.lambdas : lambdas
  const distDir = join(dir, config.distDir)
  const buildId = await generateBuildId(config.generateBuildId, nanoid)
  const configs = await Promise.all([
    getBaseWebpackConfig(dir, { buildId, isServer: false, config, lambdas: lambdasOption }),
    getBaseWebpackConfig(dir, { buildId, isServer: true, config, lambdas: lambdasOption })
  ])

  await runCompiler(configs)
  await writeBuildId(distDir, buildId)
}

function runCompiler (config) {
  return new Promise(async (resolve, reject) => {
    const webpackCompiler = await webpack(config)
    webpackCompiler.run((err, stats) => {
      if (err) {
        console.log({...err})
        console.log(...stats.errors)
        return reject(err)
      }

      let buildFailed = false
      for (const stat of stats.stats) {
        for (const error of stat.compilation.errors) {
          buildFailed = true
          console.error('ERROR', error)
          console.error('ORIGINAL ERROR', error.error)
        }

        for (const warning of stat.compilation.warnings) {
          console.warn('WARNING', warning)
        }
      }

      if (buildFailed) {
        return reject(new Error('Webpack errors'))
      }

      resolve()
    })
  })
}

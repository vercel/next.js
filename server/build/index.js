import { join } from 'path'
import fs from 'mz/fs'
import uuid from 'uuid'
import webpack from 'webpack'
import getConfig from '../config'
import getBaseWebpackConfig from './webpack'
import md5File from 'md5-file/promise'

export default async function build (dir, conf = null) {
  const config = getConfig(dir, conf)
  const buildId = uuid.v4()

  try {
    await fs.access(dir, fs.constants.W_OK)
  } catch (err) {
    console.error(`> Failed, build directory is not writeable. https://err.sh/zeit/next.js/build-dir-not-writeable`)
    throw err
  }

  try {
    const configs = await Promise.all([
      getBaseWebpackConfig(dir, { buildId, isServer: false, config }),
      getBaseWebpackConfig(dir, { buildId, isServer: true, config })
    ])

    await runCompiler(configs)

    await writeBuildStats(dir, config)
    await writeBuildId(dir, buildId, config)
  } catch (err) {
    console.error(`> Failed to build`)
    throw err
  }
}

function runCompiler (compiler) {
  return new Promise(async (resolve, reject) => {
    const webpackCompiler = await webpack(await compiler)
    webpackCompiler.run((err, stats) => {
      if (err) return reject(err)

      const jsonStats = stats.toJson()

      if (jsonStats.errors.length > 0) {
        const error = new Error(jsonStats.errors[0])
        error.errors = jsonStats.errors
        error.warnings = jsonStats.warnings
        return reject(error)
      }

      resolve(jsonStats)
    })
  })
}

async function writeBuildStats (dir, config) {
  const assetHashMap = {
    'main.js': {
      hash: await md5File(join(dir, config.distDir, 'main.js'))
    }
  }
  const buildStatsPath = join(dir, config.distDir, 'build-stats.json')
  await fs.writeFile(buildStatsPath, JSON.stringify(assetHashMap), 'utf8')
}

async function writeBuildId (dir, buildId, config) {
  const buildIdPath = join(dir, config.distDir, 'BUILD_ID')
  await fs.writeFile(buildIdPath, buildId, 'utf8')
}

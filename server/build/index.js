import { join } from 'path'
import fs from 'mz/fs'
import uuid from 'uuid'
import webpack from 'webpack'
import getConfig from '../config'
import {PHASE_PRODUCTION_BUILD} from '../../lib/constants'
import getBaseWebpackConfig from './webpack'
import md5File from 'md5-file/promise'

export default async function build (dir, conf = null) {
  const config = getConfig(PHASE_PRODUCTION_BUILD, dir, conf)
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
  // Here we can't use hashes in webpack chunks.
  // That's because the "app.js" is not tied to a chunk.
  // It's created by merging a few assets. (commons.js and main.js)
  // So, we need to generate the hash ourself.
  const assetHashMap = {
    'app.js': {
      hash: await md5File(join(dir, config.distDir, 'app.js'))
    }
  }
  const buildStatsPath = join(dir, config.distDir, 'build-stats.json')
  await fs.writeFile(buildStatsPath, JSON.stringify(assetHashMap), 'utf8')
}

async function writeBuildId (dir, buildId, config) {
  const buildIdPath = join(dir, config.distDir, 'BUILD_ID')
  await fs.writeFile(buildIdPath, buildId, 'utf8')
}

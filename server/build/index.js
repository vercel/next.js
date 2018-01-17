import { tmpdir } from 'os'
import { join } from 'path'
import fs from 'mz/fs'
import uuid from 'uuid'
import del from 'del'
import webpack from 'webpack'
import getConfig from '../config'
import getBaseWebpackConfig from './webpack'
import replaceCurrentBuild from './replace'
import md5File from 'md5-file/promise'

export default async function build (dir, conf = null) {
  const config = getConfig(dir, conf)
  const buildId = uuid.v4()
  const tempDir = tmpdir()
  const buildDir = join(tempDir, buildId)

  try {
    await fs.access(tempDir, fs.constants.W_OK)
  } catch (err) {
    console.error(`> Failed, build directory is not writeable. https://err.sh/zeit/next.js/build-dir-not-writeable`)
    throw err
  }

  try {
    const configs = await Promise.all([
      getBaseWebpackConfig(dir, { buildId, buildDir, isServer: false, config }),
      getBaseWebpackConfig(dir, { buildId, buildDir, isServer: true, config })
    ])

    await runCompiler(configs)

    await writeBuildStats(dir)
    await writeBuildId(dir, buildId)
  } catch (err) {
    console.error(`> Failed to build`)
    throw err
  }

  await replaceCurrentBuild(dir, buildDir)

  // no need to wait
  del(buildDir, { force: true })
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

async function writeBuildStats (dir) {
  // Here we can't use hashes in webpack chunks.
  // That's because the "app.js" is not tied to a chunk.
  // It's created by merging a few assets. (commons.js and main.js)
  // So, we need to generate the hash ourself.
  const assetHashMap = {
    'app.js': {
      hash: await md5File(join(dir, '.next', 'app.js'))
    }
  }
  const buildStatsPath = join(dir, '.next', 'build-stats.json')
  await fs.writeFile(buildStatsPath, JSON.stringify(assetHashMap), 'utf8')
}

async function writeBuildId (dir, buildId) {
  const buildIdPath = join(dir, '.next', 'BUILD_ID')
  await fs.writeFile(buildIdPath, buildId, 'utf8')
}

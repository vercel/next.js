import { tmpdir } from 'os'
import { join } from 'path'
import getConfig from '../config'
import fs from 'mz/fs'
import uuid from 'uuid'
import del from 'del'
import webpack from './webpack'
import replaceCurrentBuild from './replace'
import md5File from 'md5-file/promise'

export default async function build (dir) {
  const buildDir = join(tmpdir(), uuid.v4())
  const compiler = await webpack(dir, { buildDir })

  try {
    await runCompiler(compiler)

    // Pass in both the buildDir and the dir to retrieve config
    await writeBuildStats(buildDir, dir)
    await writeBuildId(buildDir, dir)
  } catch (err) {
    console.error(`> Failed to build on ${buildDir}`)
    throw err
  }

  await replaceCurrentBuild(dir, buildDir)

  // no need to wait
  del(buildDir, { force: true })
}

function runCompiler (compiler) {
  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
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

async function writeBuildStats (buildDir, dir) {
  const dist = getConfig(dir).distDir
  // Here we can't use hashes in webpack chunks.
  // That's because the "app.js" is not tied to a chunk.
  // It's created by merging a few assets. (commons.js and main.js)
  // So, we need to generate the hash ourself.
  const assetHashMap = {
    'app.js': {
      hash: await md5File(join(buildDir, dist, 'app.js'))
    }
  }
  const buildStatsPath = join(buildDir, dist, 'build-stats.json')
  await fs.writeFile(buildStatsPath, JSON.stringify(assetHashMap), 'utf8')
}

async function writeBuildId (buildDir, dir) {
  const dist = getConfig(dir).distDir
  const buildIdPath = join(buildDir, dist, 'BUILD_ID')
  const buildId = uuid.v4()
  await fs.writeFile(buildIdPath, buildId, 'utf8')
}

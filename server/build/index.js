import { tmpdir } from 'os'
import { join } from 'path'
import fs from 'mz/fs'
import uuid from 'uuid'
import del from 'del'
import webpack from './webpack'
import replaceCurrentBuild from './replace'
import mkdirp from 'mkdirp-then'
import md5File from 'md5-file/promise'

export default async function build (dir, conf = null) {
  const buildDir = join(tmpdir(), uuid.v4())
  await writeStaticStats(dir, buildDir)
  const compiler = await webpack(dir, { buildDir, conf })

  try {
    await runCompiler(compiler)
    await writeBuildStats(buildDir)
    await writeBuildId(buildDir)
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

async function writeStaticStats (dir, buildDir) {
  await mkdirp(join(buildDir, '.next'))
  const staticStatsPath = join(buildDir, '.next', 'static-stats.json')

  // this is a hacky but not sure how to tell babel plugin about location of static folder
  process.env.__NEXT_STATIC_STATS_PATH__ = staticStatsPath
  process.env.__NEXT_STATIC_DIR__ = join(dir, 'static')

  // write empty json
  await fs.writeFile(staticStatsPath, JSON.stringify({}, null, 2))
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

async function writeBuildId (dir) {
  const buildIdPath = join(dir, '.next', 'BUILD_ID')
  const buildId = uuid.v4()
  await fs.writeFile(buildIdPath, buildId, 'utf8')
}

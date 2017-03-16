import { tmpdir } from 'os'
import { join } from 'path'
import fs from 'mz/fs'
import uuid from 'uuid'
import del from 'del'
import webpack from './webpack'
import replaceCurrentBuild from './replace'

export default async function build (dir) {
  const buildDir = join(tmpdir(), uuid.v4())
  const compiler = await webpack(dir, { buildDir })

  try {
    const webpackStats = await runCompiler(compiler)
    await writeBuildStats(buildDir, webpackStats)
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

async function writeBuildStats (dir, webpackStats) {
  const chunkHashMap = {}
  webpackStats.chunks
    // We are not interested about pages
    .filter(({ files }) => !/^bundles/.test(files[0]))
    .forEach(({ hash, files }) => {
      chunkHashMap[files[0]] = { hash }
    })

  const buildStatsPath = join(dir, '.next', 'build-stats.json')
  await fs.writeFile(buildStatsPath, JSON.stringify(chunkHashMap), 'utf8')
}

async function writeBuildId (dir) {
  const buildIdPath = join(dir, '.next', 'BUILD_ID')
  const buildId = uuid.v4()
  await fs.writeFile(buildIdPath, buildId, 'utf8')
}

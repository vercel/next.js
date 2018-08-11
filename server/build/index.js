import { tmpdir } from 'os'
import { join } from 'path'
import fs from 'mz/fs'
import uuid from 'uuid'
import del from 'del'
import webpack from './webpack'
import replaceCurrentBuild from './replace'
import md5File from 'md5-file/promise'

import { build as buildServer } from './babel'

export default async function build (dir, conf = null) {
  const buildId = uuid.v4()
  const buildDir = join(tmpdir(), uuid.v4())
  const compiler = await webpack(dir, { buildId, buildDir, conf })

  try {
    const [stats] = await Promise.all([
      runCompiler(compiler),
      await buildServer([`${dir}/pages`], {
        base: dir,
        outDir: join(buildDir, '.next', 'server')
      })
    ])

    await writeBuildStats(buildDir, stats)
    await writeBuildId(buildDir, buildId)
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

async function writeBuildStats (dir, stats) {
  const statsPath = join(dir, '.next', 'webpack-stats.json')
  await fs.writeFile(statsPath, JSON.stringify(stats), 'utf8')
}

async function writeBuildId (dir, buildId) {
  const buildIdPath = join(dir, '.next', 'BUILD_ID')
  await fs.writeFile(buildIdPath, buildId, 'utf8')
}

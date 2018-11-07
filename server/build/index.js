import { join } from 'path'
import fs from 'mz/fs'
import uuid from 'uuid'
import webpack from './webpack'

import { build as buildServer } from './babel'

export default async function build (dir, server) {
  const buildId = uuid.v4()
  const buildDir = join(dir, '.next')
  const compiler = await webpack(dir, { buildId })

  const pages = (await fs.exists(`${dir}/pages`)) ? `${dir}/pages` : undefined
  if (!pages) {
    return buildServer([server], {
      base: dir,
      outDir: join(buildDir, 'server'),
      staticDir: join(buildDir, 'static')
    })
  }

  try {
    const [stats] = await Promise.all([
      runCompiler(compiler),
      await buildServer([pages, server].filter(Boolean), {
        base: dir,
        outDir: join(buildDir, 'server'),
        staticDir: join(buildDir, 'static')
      })
    ])

    await writeBuildStats(buildDir, stats)
    await writeBuildId(buildDir, buildId)
  } catch (err) {
    console.error(`> Failed to build on ${buildDir}`)
    throw err
  }
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
  const statsPath = join(dir, 'webpack-stats.json')
  await fs.writeFile(statsPath, JSON.stringify(stats), 'utf8')
}

async function writeBuildId (dir, buildId) {
  const buildIdPath = join(dir, 'BUILD_ID')
  await fs.writeFile(buildIdPath, buildId, 'utf8')
}

import fs from 'mz/fs'
import uuid from 'uuid'
import path from 'path'
import webpack from './webpack'
import clean from './clean'
import gzipAssets from './gzip'

export default async function build (dir) {
  const [compiler] = await Promise.all([
    webpack(dir),
    clean(dir)
  ])

  await runCompiler(compiler)
  await gzipAssets(dir)
  await writeBuildId(dir)
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

      resolve()
    })
  })
}

async function writeBuildId (dir) {
  const buildIdPath = path.resolve(dir, '.next', 'BUILD_ID')
  const buildId = uuid.v4()
  await fs.writeFile(buildIdPath, buildId, 'utf8')
}

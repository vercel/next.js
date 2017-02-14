import fs from 'mz/fs'
import uuid from 'uuid'
import path from 'path'
import webpack from './webpack'
import clean from './clean'
import gzipAssets from './gzip'
import replaceCurrentBuild from './replace'

export default async function build (dir) {
  const distFolder = '.next'
  const buildFolder = `.next-${uuid.v4()}`
  const compiler = await webpack(dir, buildFolder)

  await runCompiler(compiler)
  const oldFolder = await replaceCurrentBuild(dir, buildFolder, distFolder)
  await gzipAssets(dir, distFolder)
  await writeBuildId(dir, distFolder)

  clean(dir, oldFolder)
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

async function writeBuildId (dir, distFolder) {
  const buildIdPath = path.resolve(dir, distFolder, 'BUILD_ID')
  const buildId = uuid.v4()
  await fs.writeFile(buildIdPath, buildId, 'utf8')
}

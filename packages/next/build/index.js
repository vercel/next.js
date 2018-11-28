import { join } from 'path'
import promisify from '../lib/promisify'
import fs from 'fs'
import webpack from 'webpack'
import nanoid from 'nanoid'
import loadConfig from 'next-server/next-config'
import { PHASE_PRODUCTION_BUILD, BUILD_ID_FILE } from 'next-server/constants'
import getBaseWebpackConfig from './webpack'

const access = promisify(fs.access)
const writeFile = promisify(fs.writeFile)

async function generateBuildId (generate, fallback) {
  let buildId = await generate()
  // If there's no buildId defined we'll fall back
  if (buildId === null) {
    buildId = fallback()
  }

  if (typeof buildId !== 'string') {
    throw new Error('generateBuildId did not return a string. https://err.sh/zeit/next.js/generatebuildid-not-a-string')
  }

  return buildId.trim()
}

async function ensureProjectDirectoryIsWriteAble (dir) {
  try {
    await access(dir, (fs.constants || fs).W_OK)
  } catch (err) {
    throw new Error('Build directory is not writeable. https://err.sh/zeit/next.js/build-dir-not-writeable')
  }
}

export default async function build (dir, conf = null, lambdas = false) {
  const config = loadConfig(PHASE_PRODUCTION_BUILD, dir, conf)
  const lambdasOption = config.lambdas ? config.lambdas : lambdas
  const distDir = join(dir, config.distDir)
  const buildId = await generateBuildId(config.generateBuildId, nanoid)

  await ensureProjectDirectoryIsWriteAble(dir)

  try {
    const configs = await Promise.all([
      getBaseWebpackConfig(dir, { buildId, isServer: false, config, lambdas: lambdasOption }),
      getBaseWebpackConfig(dir, { buildId, isServer: true, config, lambdas: lambdasOption })
    ])

    await runCompiler(configs)

    await writeBuildId(distDir, buildId)
  } catch (err) {
    console.error(`> Failed to build`)
    throw err
  }
}

function runCompiler (compiler) {
  return new Promise(async (resolve, reject) => {
    const webpackCompiler = await webpack(await compiler)
    webpackCompiler.run((err, stats) => {
      if (err) {
        console.log({...err})
        console.log(...stats.errors)
        return reject(err)
      }

      let buildFailed = false
      for (const stat of stats.stats) {
        for (const error of stat.compilation.errors) {
          buildFailed = true
          console.error('ERROR', error)
          console.error('ORIGINAL ERROR', error.error)
        }

        for (const warning of stat.compilation.warnings) {
          console.warn('WARNING', warning)
        }
      }

      if (buildFailed) {
        return reject(new Error('Webpack errors'))
      }

      resolve()
    })
  })
}

async function writeBuildId (distDir, buildId) {
  const buildIdPath = join(distDir, BUILD_ID_FILE)
  await writeFile(buildIdPath, buildId, 'utf8')
}

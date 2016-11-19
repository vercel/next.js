import { join } from 'path'
import { existsSync } from 'fs'

const cache = new Map()

const defaultConfig = {
  cdn: true,
  webpack: null
}

export default function getConfig (dir) {
  if (!cache.has(dir)) {
    cache.set(dir, loadConfig(dir))
  }
  return cache.get(dir)
}

function loadConfig (dir) {
  const path = join(dir, 'next.config.js')
  const packagePath = join(dir, 'package.json')

  let userConfig = {}
  let packageConfig = null

  const userHasConfig = existsSync(path)
  if (userHasConfig) {
    const userConfigModule = require(path)
    userConfig = userConfigModule.default || userConfigModule
  }

  const userHasPackageConfig = existsSync(packagePath)
  if (userHasPackageConfig) {
    packageConfig = require(packagePath).next
  }

  if (packageConfig) {
    console.warn("> [warn] You're using package.json as source of config for next.js. Use next.config.js instead.")
  }

  return Object.assign({}, defaultConfig, userConfig, packageConfig || {})
}

import { join } from 'path'

const cache = new Map()

const defaultConfig = {}

export default function getConfig (dir) {
  if (!cache.has(dir)) {
    cache.set(dir, loadConfig(dir))
  }
  return cache.get(dir)
}

async function loadConfig (dir) {
  const path = join(dir, 'next.config.js')

  let module
  try {
    module = require(path)
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      module = {}
    } else {
      throw err
    }
  }

  // no try-cache, it must be a valid json
  const config = module.default || module || {}

  return Object.assign({}, defaultConfig, config)
}

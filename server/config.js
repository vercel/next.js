import { join } from 'path'
import { readFile } from 'mz/fs'

const cache = new Map()

const defaultConfig = { cdn: true }

export default function getConfig (dir) {
  if (!cache.has(dir)) {
    cache.set(dir, loadConfig(dir))
  }
  return cache.get(dir)
}

async function loadConfig (dir) {
  const path = join(dir, 'package.json')

  let data
  try {
    data = await readFile(path, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      data = '{}'
    } else {
      throw err
    }
  }

  // no try-cache, it must be a valid json
  const config = JSON.parse(data).next || {}

  return Object.assign({}, defaultConfig, config)
}

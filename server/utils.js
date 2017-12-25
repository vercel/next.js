import { join } from 'path'
import { readdirSync, existsSync } from 'fs'

export const IS_BUNDLED_PAGE = /^bundles[/\\]pages.*\.(js|jsx)$/
export const MATCH_ROUTE_NAME = /^bundles[/\\]pages[/\\](.*)\.(js|jsx)$/

export function getAvailableChunks (dir, dist) {
  const chunksDir = join(dir, dist, 'chunks')
  if (!existsSync(chunksDir)) return {}

  const chunksMap = {}
  const chunkFiles = readdirSync(chunksDir)

  chunkFiles.forEach(filename => {
    if (/\.js$/.test(filename)) {
      const chunkName = filename.replace(/-.*/, '')
      chunksMap[chunkName] = filename
    }
  })

  return chunksMap
}

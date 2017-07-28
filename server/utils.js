import { join } from 'path'
import { readdirSync, existsSync } from 'fs'

export const IS_BUNDLED_PAGE = /^pages.*\.js$/
export const MATCH_ROUTE_NAME = /^pages[/\\](.*)\.js$/

export function getAvailableChunks (dir, dist) {
  const chunksDir = join(dir, dist, 'chunks')
  if (!existsSync(chunksDir)) return {}

  const chunksMap = {}
  const chunkFiles = readdirSync(chunksDir)

  chunkFiles.forEach(filename => {
    if (/\.js$/.test(filename)) {
      chunksMap[filename] = true
    }
  })

  return chunksMap
}

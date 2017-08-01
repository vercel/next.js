/* eslint-disable no-useless-escape */
import { join } from 'path'
import { readdirSync, existsSync } from 'fs'
import getConfig from './config'

const dir = process.cwd()
const config = getConfig(dir)

const extensions = config.pagesExtensions.join('|')

export const IS_BUNDLED_PAGE = new RegExp(`^bundles[/\\\\]pages.*\.(${extensions})$`)
export const MATCH_ROUTE_NAME = new RegExp(`^bundles[/\\\\]pages[/\\\\](.*)\.(${extensions})$`)

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

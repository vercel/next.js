import { join } from 'path'
import { readdirSync, existsSync } from 'fs'

export const IS_BUNDLED_PAGE = /^bundles[/\\]pages.*\.js$/
export const MATCH_ROUTE_NAME = /^bundles[/\\]pages[/\\](.*)\.js$/

export function getAvailableChunks (distDir) {
  const chunksDir = join(distDir, 'chunks')
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

const internalPrefixes = [
  /^\/_next\//,
  /^\/static\//
]

export function isInternalUrl (url) {
  for (const prefix of internalPrefixes) {
    if (prefix.test(url)) {
      return true
    }
  }

  return false
}

export function addCorsSupport (req, res) {
  if (!req.headers.origin) {
    return { preflight: false }
  }

  res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
  res.setHeader('Access-Control-Request-Method', req.headers.origin)
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET')
  res.setHeader('Access-Control-Allow-Headers', req.headers.origin)

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return { preflight: true }
  }

  return { preflight: false }
}

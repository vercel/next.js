import { join } from 'path'
import { readdirSync, existsSync } from 'fs'

export const IS_BUNDLED_PAGE = /^bundles[/\\]pages.*\.js$/
export const MATCH_ROUTE_NAME = /^bundles[/\\]pages[/\\](.*)\.js$/

export function getChunkNameFromFilename (filename) {
  return filename.replace(/-[^-]*$/, '')
}

export function getAvailableChunks (distDir) {
  const chunksDir = join(distDir, 'chunks')
  if (!existsSync(chunksDir)) return {}

  const chunksMap = {}
  const chunkFiles = readdirSync(chunksDir)

  chunkFiles.forEach(filename => {
    if (/\.js$/.test(filename)) {
      const chunkName = getChunkNameFromFilename(filename)
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
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET')
  // Based on https://github.com/primus/access-control/blob/4cf1bc0e54b086c91e6aa44fb14966fa5ef7549c/index.js#L158
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'])

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return { preflight: true }
  }

  return { preflight: false }
}

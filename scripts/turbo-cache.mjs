// Turbo remote cache client.
//
// Provides exists/get/put operations against the Vercel turbo remote cache API.
// Handles both vercel.com (/api/v8/artifacts/) and custom self-hosted servers
// (/v8/artifacts/).
//
// put() accepts either a Buffer/Uint8Array or a string path to stream from disk
// (for large files that exceed Node's 2GB Buffer limit).
//
// Usage:
//   import * as cache from './turbo-cache.mjs'
//   await cache.exists(hexKey)          // -> boolean
//   await cache.get(hexKey)             // -> Buffer | null
//   await cache.put(hexKey, buffer)     // upload from memory
//   await cache.put(hexKey, '/path')    // stream upload from file

import fs from 'fs'
import { createHash } from 'crypto'
import { Readable } from 'stream'

const TURBO_API = process.env.TURBO_API || 'https://vercel.com'
const TURBO_TOKEN = process.env.TURBO_TOKEN
const TURBO_TEAM = process.env.TURBO_TEAM

const IS_VERCEL = new URL(TURBO_API).hostname === 'vercel.com'

// Vercel's cache API lives at /api/v8/artifacts/ and uses ?teamId=.
// Self-hosted turbo cache servers use /v8/artifacts/ and ?slug=.
export function artifactUrl(key) {
  if (IS_VERCEL) {
    const qs = TURBO_TEAM ? `?teamId=${TURBO_TEAM}` : ''
    return `https://vercel.com/api/v8/artifacts/${key}${qs}`
  }
  const qs = TURBO_TEAM ? `?slug=${TURBO_TEAM}` : ''
  return `${TURBO_API}/v8/artifacts/${key}${qs}`
}

function baseHeaders() {
  return {
    Authorization: `Bearer ${TURBO_TOKEN}`,
    'User-Agent': 'turbo 2 next.js-ci',
    'x-artifact-client-ci': 'GITHUB_ACTIONS',
  }
}

/** Check if an artifact exists. */
export async function exists(key) {
  const res = await fetch(artifactUrl(key), {
    method: 'HEAD',
    headers: baseHeaders(),
  })
  return res.status === 200
}

/** Download an artifact. Returns Buffer on hit, null on miss. */
export async function get(key) {
  const res = await fetch(artifactUrl(key), {
    method: 'GET',
    headers: baseHeaders(),
  })
  if (!res.ok) return null
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Download an artifact as a Node.js Readable stream. Throws on failure.
 */
export async function getStream(key) {
  const res = await fetch(artifactUrl(key), {
    method: 'GET',
    headers: baseHeaders(),
  })
  if (!res.ok) {
    throw new Error(`GET ${key} failed: ${res.status} ${res.statusText}`)
  }
  return Readable.fromWeb(res.body)
}

/**
 * Download an artifact to a file. Returns true on hit, false on miss.
 * Uses streaming to handle files larger than 2GB.
 */
export async function getToFile(key, destPath) {
  try {
    const stream = await getStream(key)
    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(destPath)
      stream.pipe(ws)
      ws.on('finish', resolve)
      ws.on('error', reject)
      stream.on('error', reject)
    })
    return true
  } catch {
    return false
  }
}

/**
 * Upload an artifact.
 * @param {string} key - hex-only cache key
 * @param {Buffer|Uint8Array|string} data - Buffer/Uint8Array for in-memory,
 *   or a string file path to stream from disk (for large files).
 */
export async function put(key, data) {
  const isFile = typeof data === 'string'
  const size = isFile ? fs.statSync(data).size : data.length

  const headers = {
    ...baseHeaders(),
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(size),
    'x-artifact-duration': '0',
  }

  let body
  if (isFile) {
    // Stream from file — avoids loading into memory
    body = Readable.toWeb(fs.createReadStream(data))
  } else {
    body = data
  }

  const res = await fetch(artifactUrl(key), {
    method: 'PUT',
    headers,
    body,
    // Required for streaming request bodies in Node fetch
    duplex: isFile ? 'half' : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `PUT ${key} failed: ${res.status} ${res.statusText} ${text.slice(0, 200)}`
    )
  }
}

/**
 * Verify read+write access. Returns true if both work.
 */
export async function healthCheck() {
  const testKey = createHash('sha256')
    .update(`turbo-cache-health-${Date.now()}`)
    .digest('hex')

  console.error(`Turbo cache health check:`)
  console.error(`  API: ${IS_VERCEL ? 'vercel.com' : TURBO_API}`)
  console.error(`  Team: ${TURBO_TEAM || '(none)'}`)
  console.error(
    `  Token: ${TURBO_TOKEN ? TURBO_TOKEN.slice(0, 8) + '...' : '(not set)'}`
  )

  if (!TURBO_TOKEN) {
    console.error('  SKIP: no TURBO_TOKEN')
    return false
  }

  try {
    // READ
    const e = await exists(testKey)
    console.error(`  READ:   exists -> ${e}`)

    // WRITE
    const testData = Buffer.from('turbo-cache-write-test')
    await put(testKey, testData)
    console.error(`  WRITE:  put -> OK`)

    // VERIFY
    const readBack = await get(testKey)
    if (readBack && readBack.equals(testData)) {
      console.error(`  VERIFY: get -> OK (${readBack.length}B)`)
    } else {
      console.error(
        `  VERIFY: get -> mismatch (${readBack ? readBack.length : 0}B)`
      )
    }

    return true
  } catch (e) {
    console.error(`  FAIL: ${e.message}`)
    return false
  }
}

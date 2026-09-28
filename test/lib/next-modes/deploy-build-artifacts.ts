import { createHash } from 'crypto'
import { gunzipSync } from 'zlib'

const maxBytes = 8 * 1024 * 1024
const maxEncodedBytes = 256 * 1024

// This function is serialized into the fixture and runs in its remote build.
// Keep it self-contained and use only Node built-ins.
function emitBuildArtifacts(
  files: string[],
  byteLimit: number,
  encodedLimit: number
) {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const { gzipSync } = require('zlib') as typeof import('zlib')
  const { createHash: hash } = require('crypto') as typeof import('crypto')
  const root = fs.realpathSync(process.cwd())
  const artifacts: [string, string][] = []
  let size = 0
  for (const file of files) {
    const resolved = fs.realpathSync(file)
    if (!resolved.startsWith(root + path.sep)) {
      throw new Error(`Build artifact escapes the fixture: ${file}`)
    }
    const stat = fs.statSync(resolved)
    size += stat.size
    if (!stat.isFile() || size > byteLimit) {
      throw new Error(`Build artifacts exceed the file/size limits: ${file}`)
    }
    artifacts.push([file, fs.readFileSync(resolved).toString('base64')])
  }
  const encoded = gzipSync(Buffer.from(JSON.stringify(artifacts))).toString(
    'base64'
  )
  if (encoded.length > encodedLimit) {
    throw new Error('Build artifacts exceed the build-log transport limit')
  }
  const digest = hash('sha256').update(encoded).digest('hex')
  const chunks = encoded.match(/.{1,1024}/g)!
  for (const [index, chunk] of chunks.entries()) {
    console.log(
      `NEXT_TEST_BUILD_ARTIFACT:${digest}:${index}:${chunks.length}:${chunk}`
    )
  }
  console.log(`NEXT_TEST_BUILD_ARTIFACT_END:${digest}`)
}

export function createBuildArtifactScript(files: string[]): string {
  if (
    files.length === 0 ||
    files.length > 64 ||
    new Set(files).size !== files.length ||
    files.some(
      (file) =>
        !file ||
        file.startsWith('/') ||
        file.includes('\\') ||
        file.includes(':') ||
        file.includes('\0') ||
        file.split('/').some((part) => !part || part === '.' || part === '..')
    )
  ) {
    throw new Error(
      'deployBuildArtifacts must contain unique relative file paths'
    )
  }
  return `(${emitBuildArtifacts.toString()})(${JSON.stringify(files)}, ${maxBytes}, ${maxEncodedBytes})\n`
}

export function parseBuildArtifacts(
  output: string,
  files: string[]
): Map<string, Buffer> {
  const end = output.match(/NEXT_TEST_BUILD_ARTIFACT_END:([a-f0-9]{64})/)
  if (!end) throw new Error('Missing build artifact completion marker')
  const chunks = new Map<number, string>()
  let count: number | undefined
  let encodedSize = 0
  for (const match of output.matchAll(
    /NEXT_TEST_BUILD_ARTIFACT:([a-f0-9]{64}):(\d+):(\d+):([A-Za-z0-9+/=]+)/g
  )) {
    const [, digest, indexString, countString, chunk] = match
    const index = Number(indexString)
    const total = Number(countString)
    if (
      digest !== end[1] ||
      !Number.isSafeInteger(total) ||
      total < 1 ||
      total > maxEncodedBytes / 1024 ||
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= total ||
      (count !== undefined && count !== total) ||
      (chunks.has(index) && chunks.get(index) !== chunk)
    ) {
      throw new Error('Inconsistent build artifact chunks')
    }
    count = total
    if (!chunks.has(index)) {
      encodedSize += chunk.length
      if (encodedSize > maxEncodedBytes) {
        throw new Error('Build artifacts exceed the build-log transport limit')
      }
      chunks.set(index, chunk)
    }
  }
  if (count === undefined || chunks.size !== count) {
    throw new Error('Incomplete build artifact chunks')
  }
  const encoded = Array.from({ length: count }, (_, i) => chunks.get(i)).join(
    ''
  )
  if (createHash('sha256').update(encoded).digest('hex') !== end[1]) {
    throw new Error('Build artifact checksum mismatch')
  }
  const entries: unknown = JSON.parse(
    gunzipSync(Buffer.from(encoded, 'base64'), {
      // JSON contains base64-encoded files plus their paths.
      maxOutputLength: maxBytes * 2,
    }).toString('utf8')
  )
  if (!Array.isArray(entries) || entries.length !== files.length) {
    throw new Error('Unexpected build artifact inventory')
  }
  const artifacts = new Map<string, Buffer>()
  let size = 0
  for (const entry of entries) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      !files.includes(entry[0]) ||
      artifacts.has(entry[0]) ||
      typeof entry[1] !== 'string'
    ) {
      throw new Error('Unexpected build artifact entry')
    }
    const buffer = Buffer.from(entry[1], 'base64')
    size += buffer.length
    if (size > maxBytes || buffer.toString('base64') !== entry[1]) {
      throw new Error('Invalid build artifact content')
    }
    artifacts.set(entry[0], buffer)
  }
  return artifacts
}

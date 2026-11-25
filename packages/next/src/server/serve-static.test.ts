/* eslint-env node */
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { IncomingMessage } from 'http'

import type { CompressionAlgorithm } from './lib/compression'
import { staticSidecarOrder } from './lib/compression'
import { pickPrecompressedVariant } from './serve-static'

// Real files on disk keep the process-lifetime sidecar cache honest: each
// scenario uses a unique temporary directory.
function fixture(
  files: string[],
  acceptEncoding?: string,
  method = 'GET'
): CompressionAlgorithm | null {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-static-'))
  const original = path.join(dir, 'chunk.js')
  fs.writeFileSync(original, 'x'.repeat(2048))
  for (const file of files) {
    fs.writeFileSync(path.join(dir, file), 'compressed')
  }
  const req = {
    method,
    headers: acceptEncoding ? { 'accept-encoding': acceptEncoding } : {},
  } as IncomingMessage
  return pickPrecompressedVariant(req, original, sidecarOrder)
}

const sidecarOrder = staticSidecarOrder(['zstd', 'brotli', 'gzip'])

describe('pickPrecompressedVariant', () => {
  it('prefers brotli for static assets when everything is acceptable', () => {
    expect(fixture(['chunk.js.br', 'chunk.js.zst'], 'zstd, br, gzip')).toBe(
      'brotli'
    )
  })

  it('honors an exact encoding request even when br exists', () => {
    expect(fixture(['chunk.js.br', 'chunk.js.zst'], 'zstd')).toBe('zstd')
  })

  it('falls through to the next acceptable variant missing on disk', () => {
    // The build skips variants that would grow the file; a client accepting
    // both must still get a pre-compressed variant.
    expect(fixture(['chunk.js.br'], 'zstd, br')).toBe('brotli')
  })

  it('serves the original when only the requested variant is absent', () => {
    expect(fixture(['chunk.js.br'], 'zstd')).toBeNull()
  })

  it('treats an unlisted encoding as not acceptable (no wildcard)', () => {
    expect(fixture(['chunk.js.br', 'chunk.js.gz'], 'deflate')).toBeNull()
  })

  it('lets explicit q=0 reject a variant that exists on disk', () => {
    expect(fixture(['chunk.js.br', 'chunk.js.zst'], 'br;q=0, zstd')).toBe(
      'zstd'
    )
  })

  it('accepts the wildcard', () => {
    expect(fixture(['chunk.js.br'], '*')).toBe('brotli')
  })

  it('keeps HEAD on the original file', () => {
    expect(
      fixture(['chunk.js.br'], 'zstd, br, gzip', 'HEAD')
      // HEAD must return the exact Content-Length of the original
    ).toBeNull()
  })

  it('serves the original without an Accept-Encoding header', () => {
    expect(fixture(['chunk.js.br'])).toBeNull()
  })

  it('performs no probing at all with an empty sidecar order', () => {
    // The default path (no `staticPrecompress`) passes an empty order.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-static-'))
    const original = path.join(dir, 'chunk.js')
    fs.writeFileSync(original, 'x'.repeat(2048))
    fs.writeFileSync(original + '.br', 'compressed')
    const req = {
      method: 'GET',
      headers: { 'accept-encoding': 'br' },
    } as IncomingMessage
    expect(pickPrecompressedVariant(req, original, [])).toBeNull()
  })
})

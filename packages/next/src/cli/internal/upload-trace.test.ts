import zlib from 'zlib'
import { checkTurbopackTrace } from './upload-trace'

const FILE = 'trace-turbopack.bin'
const NOT_A_TRACE = `Error: ${FILE} does not appear to be a valid Turbopack trace (missing TRACEv1 header).`
const unsupportedVersion = (found: string) =>
  `Error: ${FILE} has an unsupported Turbopack trace version (expected TRACEv1, found ${found}). Capture the trace again with this version of Next.js.`

/** A trace with the given header followed by compressible (but not trivial) row data. */
function trace(header: string, size = 1024 * 1024): Buffer {
  const rows = Buffer.alloc(size)
  for (let i = 0; i < size; i++) {
    rows[i] = (i * 7919) % 251 > 200 ? i % 13 : 0
  }
  return Buffer.concat([Buffer.from(header), rows])
}

const zstd = zlib as {
  zstdCompressSync?: (data: Buffer) => Buffer
  createZstdDecompress?: () => import('stream').Transform
}

describe('checkTurbopackTrace', () => {
  it('checks the header of raw traces', async () => {
    expect(await checkTurbopackTrace(trace('TRACEv1', 100), FILE)).toEqual({
      valid: true,
    })
    expect(await checkTurbopackTrace(trace('TRACEv0', 100), FILE)).toEqual({
      valid: false,
      error: unsupportedVersion('TRACEv0'),
    })
    expect(await checkTurbopackTrace(Buffer.from('hello world'), FILE)).toEqual(
      { valid: false, error: NOT_A_TRACE }
    )
    // A header that ends before the version
    expect(await checkTurbopackTrace(Buffer.from('TRACEv'), FILE)).toEqual({
      valid: false,
      error: NOT_A_TRACE,
    })
  })

  it('checks the header of gzip compressed traces', async () => {
    const v1 = zlib.gzipSync(trace('TRACEv1'))
    expect(await checkTurbopackTrace(v1, FILE)).toEqual({ valid: true })
    // Only the start of the file is passed in
    expect(await checkTurbopackTrace(v1.subarray(0, 4096), FILE)).toEqual({
      valid: true,
    })
    expect(
      await checkTurbopackTrace(zlib.gzipSync(trace('TRACEv0')), FILE)
    ).toEqual({ valid: false, error: unsupportedVersion('TRACEv0') })
    expect(
      await checkTurbopackTrace(zlib.gzipSync(Buffer.from('nope')), FILE)
    ).toEqual({ valid: false, error: NOT_A_TRACE })
  })

  it('rejects gzip data that ends or is invalid before the header', async () => {
    const v1 = zlib.gzipSync(trace('TRACEv1'))
    // Only the gzip header, no compressed data
    expect(await checkTurbopackTrace(v1.subarray(0, 10), FILE)).toEqual({
      valid: false,
      error: NOT_A_TRACE,
    })
    const corrupt = Buffer.concat([
      Buffer.from([0x1f, 0x8b]),
      Buffer.from('definitely not deflate data'),
    ])
    expect(await checkTurbopackTrace(corrupt, FILE)).toEqual({
      valid: false,
      error: NOT_A_TRACE,
    })
  })

  it('only decompresses the start of highly compressed data', async () => {
    // 64 MB of zeros, about 64 KB compressed
    const bomb = zlib.gzipSync(Buffer.alloc(64 * 1024 * 1024))
    expect(await checkTurbopackTrace(bomb, FILE)).toEqual({
      valid: false,
      error: NOT_A_TRACE,
    })
  })

  it('accepts zstd compressed traces by their magic bytes when Node.js has no zstd support', async () => {
    const data = Buffer.concat([
      Buffer.from([0x28, 0xb5, 0x2f, 0xfd]),
      Buffer.from('anything'),
    ])
    expect(await checkTurbopackTrace(data, FILE, null)).toEqual({
      valid: true,
      warning: `Warning: Can't check the trace version of ${FILE}, since this version of Node.js doesn't support zstd.`,
    })
  })

  it('checks the header of zstd compressed traces', async () => {
    const { zstdCompressSync, createZstdDecompress } = zstd
    if (!zstdCompressSync || !createZstdDecompress) {
      // This Node.js version has no zstd support, so zstd traces are accepted by their magic
      // bytes alone
      const data = Buffer.concat([
        Buffer.from([0x28, 0xb5, 0x2f, 0xfd]),
        Buffer.from('anything'),
      ])
      expect(await checkTurbopackTrace(data, FILE)).toMatchObject({
        valid: true,
      })
      return
    }
    const v1 = zstdCompressSync(trace('TRACEv1'))
    expect(await checkTurbopackTrace(v1, FILE)).toEqual({ valid: true })
    expect(
      await checkTurbopackTrace(zstdCompressSync(trace('TRACEv0')), FILE)
    ).toEqual({ valid: false, error: unsupportedVersion('TRACEv0') })
    // Ends before the first block is complete
    expect(await checkTurbopackTrace(v1.subarray(0, 12), FILE)).toEqual({
      valid: false,
      error: NOT_A_TRACE,
    })
    const corrupt = Buffer.concat([
      Buffer.from([0x28, 0xb5, 0x2f, 0xfd]),
      Buffer.from('definitely not zstd data'),
    ])
    expect(await checkTurbopackTrace(corrupt, FILE)).toEqual({
      valid: false,
      error: NOT_A_TRACE,
    })
  })
})

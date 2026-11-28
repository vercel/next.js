import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { promisify } from 'util'

import type { CompressionAlgorithm } from '../server/lib/compression'
import { PRECOMPRESSED_EXTENSIONS } from '../server/lib/compression'

// `zlib.zstdCompress` is newer than the type definitions available here.
type ZlibWithZstd = typeof zlib & {
  zstdCompress?: (
    buf: Buffer,
    options: { level?: number },
    cb: (err: Error | null, compressed: Buffer) => void
  ) => void
}
const zlibMaybe = zlib as ZlibWithZstd

const gzipAsync = promisify(zlib.gzip)
const brotliCompressAsync = promisify(zlib.brotliCompress)
const zstdCompressAsync = zlibMaybe.zstdCompress
  ? promisify(zlibMaybe.zstdCompress)
  : null

/**
 * File extensions worth pre-compressing under `distDir/static`. Anything not
 * listed (images, fonts, wasm, …) is already compressed binary or would grow
 * the build output for no gain.
 */
const PRECOMPRESSIBLE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.map',
  '.json',
  '.svg',
  '.txt',
  '.xml',
])

export interface PrecompressOptions {
  /** Absolute path of the build output directory (`.next`). */
  distDir: string
  /** Algorithms to emit sidecars for, most preferred first is irrelevant. */
  algorithms: CompressionAlgorithm[]
  /** Skip files smaller than this many bytes (default 1024). */
  threshold?: number
  gzipLevel?: number
  brotliQuality?: number
  zstdLevel?: number
  /**
   * Number of files compressed concurrently. Compression is CPU-bound and
   * runs at the tail of `next build`; a modest ceiling avoids thrashing
   * machines that already ran the bundler at full tilt.
   */
  concurrency?: number
}

export interface PrecompressResult {
  files: number
  sidecars: number
  /** Total bytes saved across all sidecars (uncompressed - compressed). */
  bytesSaved: number
}

/**
 * Walks `distDir/static` and stores pre-compressed sidecars
 * (`file.js.br`, `file.js.gz`, …) next to every compressible asset, so the
 * server can serve them based on `Accept-Encoding` instead of compressing
 * per request. Sidecars that would grow the file are not written.
 */
export async function precompressStaticAssets(
  options: PrecompressOptions
): Promise<PrecompressResult> {
  const staticRoot = path.join(options.distDir, 'static')
  const result: PrecompressResult = { files: 0, sidecars: 0, bytesSaved: 0 }

  if (!(await directoryExists(staticRoot))) {
    return result
  }

  const threshold = options.threshold ?? 1024
  if (options.algorithms.length === 0) return result
  const algorithms = options.algorithms

  const files = await collectPrecompressibleFiles(staticRoot)

  const concurrency = Math.max(1, options.concurrency ?? 8)
  let index = 0

  async function worker(): Promise<void> {
    while (index < files.length) {
      const filePath = files[index++]
      let contents: Buffer
      try {
        contents = await fs.promises.readFile(filePath)
      } catch {
        continue
      }
      if (contents.length < threshold) continue

      result.files++
      for (const algorithm of algorithms) {
        const compressed = await compress(algorithm, contents, options)
        if (compressed === null) continue
        // Don't store variants that make the file bigger.
        if (compressed.length >= contents.length) continue

        await fs.promises.writeFile(
          filePath + PRECOMPRESSED_EXTENSIONS[algorithm],
          compressed
        )
        result.sidecars++
        result.bytesSaved += contents.length - compressed.length
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  return result
}

async function compress(
  algorithm: CompressionAlgorithm,
  contents: Buffer,
  options: PrecompressOptions
): Promise<Buffer | null> {
  switch (algorithm) {
    case 'gzip':
      return gzipAsync(contents, {
        level: options.gzipLevel,
      })
    case 'brotli':
      return brotliCompressAsync(contents, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: options.brotliQuality ?? 11,
        },
      })
    case 'zstd':
      // Absent on Node.js versions without zstd in zlib.
      if (!zstdCompressAsync) return null
      return zstdCompressAsync(contents, {
        level: options.zstdLevel ?? 3,
      })
    default:
      return null
  }
}

async function directoryExists(candidate: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(candidate)).isDirectory()
  } catch {
    return false
  }
}

async function collectPrecompressibleFiles(dir: string): Promise<string[]> {
  const collected: string[] = []

  async function walk(current: string): Promise<void> {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(entryPath)
      } else if (
        entry.isFile() &&
        PRECOMPRESSIBLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ) {
        collected.push(entryPath)
      }
    }
  }

  await walk(dir)
  return collected
}

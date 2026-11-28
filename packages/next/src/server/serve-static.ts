import type { IncomingMessage, ServerResponse } from 'http'
import fs from 'fs'
import type { CompressionAlgorithm } from './lib/compression'
import {
  CONTENT_ENCODING_NAMES,
  PRECOMPRESSED_EXTENSIONS,
  getAcceptEncoding,
  negotiateEncodingOrder,
} from './lib/compression'
import send from 'next/dist/compiled/send'

// TODO: Remove this once "send" has updated the "mime", or next.js use custom version of "mime"
// Although "mime" has already add avif in version 2.4.7, "send" is still using mime@1.6.0
send.mime.define({
  'image/avif': ['avif'],
  'image/x-icns': ['icns'],
  'image/jxl': ['jxl'],
  'image/heic': ['heic'],
})

export function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  opts?: Parameters<typeof send>[2]
): Promise<void> {
  return new Promise((resolve, reject) => {
    send(req, path, opts)
      .on('directory', () => {
        // We don't allow directories to be read.
        const err: any = new Error('No directory access')
        err.code = 'ENOENT'
        reject(err)
      })
      .on('error', reject)
      .pipe(res)
      .on('finish', resolve)
  })
}

export const getContentType: (extWithoutDot: string) => string | null =
  'getType' in send.mime
    ? (extWithoutDot: string) => send.mime.getType(extWithoutDot)
    : // TODO(as-any): pre-existing cast, not yet reviewed
      // eslint-disable-next-line @next/internal/no-as-any
      (extWithoutDot: string) => (send.mime as any).lookup(extWithoutDot)

export const getExtension: (contentType: string) => string | null =
  'getExtension' in send.mime
    ? (contentType: string) => send.mime.getExtension(contentType)
    : // TODO(as-any): pre-existing cast, not yet reviewed
      // eslint-disable-next-line @next/internal/no-as-any
      (contentType: string) => (send.mime as any).extension(contentType)

/**
 * Serves `path`, preferring a pre-compressed sidecar of the same file when
 * the client accepts its `Content-Encoding`. Falls back to the regular
 * `serveStatic` behavior when there is no usable variant.
 */
export function serveStaticPrecompressed(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  absoluteFilePath: string,
  opts: Parameters<typeof send>[2],
  sidecarOrder: CompressionAlgorithm[]
): Promise<void> {
  const algorithm = pickPrecompressedVariant(
    req,
    absoluteFilePath,
    sidecarOrder
  )
  if (!algorithm) {
    return serveStatic(req, res, path, opts)
  }

  return new Promise((resolve, reject) => {
    // `send` derives the media type from the extension of the sidecar path,
    // which is unknown (`file.js.br`) or wrong (`file.js.gz` would map to
    // `application/gzip`), so every `setHeader('content-type', …)` it makes
    // is forced to the original file's type. `Content-Encoding` and `Vary`
    // are never produced by `send`, so setting them directly is enough.
    forceContentType(res, getContentTypeOfOriginal(path))
    res.setHeader('Content-Encoding', CONTENT_ENCODING_NAMES[algorithm])
    res.setHeader('Vary', 'Accept-Encoding')

    send(req, path + PRECOMPRESSED_EXTENSIONS[algorithm], opts)
      .on('directory', () => {
        // We don't allow directories to be read.
        const err: any = new Error('No directory access')
        err.code = 'ENOENT'
        reject(err)
      })
      .on('error', reject)
      .pipe(res)
      .on('finish', resolve)
  })
}

/**
 * Returns the pre-compressed variant of `absoluteFilePath` to serve for this
 * request, or `null` to serve the original file unchanged. The first variant
 * that is both acceptable (per `Accept-Encoding`) and present on disk wins.
 */
export function pickPrecompressedVariant(
  req: IncomingMessage,
  absoluteFilePath: string,
  sidecarOrder: CompressionAlgorithm[]
): CompressionAlgorithm | null {
  if (req.method !== 'GET') {
    // HEAD keeps the original file so the response keeps the exact
    // Content-Length it would have had without this feature.
    return null
  }

  for (const algorithm of negotiateEncodingOrder(
    getAcceptEncoding(req),
    sidecarOrder
  )) {
    const sidecarPath = absoluteFilePath + PRECOMPRESSED_EXTENSIONS[algorithm]
    // Static assets are content-hashed and immutable, so it is safe to
    // remember which sidecars exist for the lifetime of the process.
    let exists = sidecarExistenceCache.get(sidecarPath)
    if (exists === undefined) {
      exists = fs.existsSync(sidecarPath)
      sidecarExistenceCache.set(sidecarPath, exists)
    }
    if (exists) {
      return algorithm
    }
  }

  return null
}

// Only consulted when the build emitted sidecars (`staticPrecompress`), so
// the regular serving path performs no extra file system probes.
const sidecarExistenceCache = new Map<string, boolean>()

/**
 * Forces every `res.setHeader('content-type', …)` call to write `value`
 * instead, so `send` cannot overwrite the type of the original file with its
 * own mime lookup on the sidecar extension.
 */
function forceContentType(res: ServerResponse, value: string): void {
  const original = res.setHeader.bind(res)
  ;(res as { setHeader: (name: string, value: any) => void }).setHeader = (
    name: string,
    headerValue: any
  ) => {
    if (String(name).toLowerCase() === 'content-type') {
      original(name, value)
      return
    }
    original(name, headerValue)
  }
}

function getContentTypeOfOriginal(path: string): string {
  const dotIndex = path.lastIndexOf('.')
  if (dotIndex === -1) return 'application/octet-stream'
  return getContentType(path.slice(dotIndex + 1)) || 'application/octet-stream'
}

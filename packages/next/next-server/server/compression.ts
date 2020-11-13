import zlib, { Zlib, ZlibOptions, BrotliOptions } from 'zlib'
import { IncomingMessage, ServerResponse as HttpServerResponse } from 'http'
import { Transform } from 'stream'
import compressible from 'compressible'
import onHeaders from 'on-headers'
import vary from 'vary'
import Accept from '@hapi/accept'

export type ServerResponse = HttpServerResponse & {
  flush?: () => void
  _header?: { [key: string]: any }
  _implicitHeader?: () => void
}

export type RequestListener = (
  req: IncomingMessage,
  res: ServerResponse
) => void

type Listener = (...args: any[]) => void
type EventType = 'close' | 'drain' | 'error' | 'finish' | 'pipe' | 'unpipe'

export interface CompressionFilter {
  (req?: IncomingMessage, res?: ServerResponse): boolean
}

export type Options = ZlibOptions &
  BrotliOptions & {
    threshold?: number
    filter?: CompressionFilter
  }

const preferredEncodings = ['gzip', 'deflate', 'identity']

if ('createBrotliCompress' in zlib) {
  preferredEncodings.unshift('br')
}

const cacheControlNoTransformRegExp = /(?:^|,)\s*?no-transform\s*?(?:,|$)/

const Compression = (opts: Options = {}): RequestListener => {
  const filter = opts.filter ?? shouldCompress
  if (!opts.params) {
    opts.params = {}
  }
  if (opts.params[zlib.constants.BROTLI_PARAM_QUALITY] === undefined) {
    opts.params[zlib.constants.BROTLI_PARAM_QUALITY] = 4
  }

  const threshold: number = opts.threshold ?? 1024

  return function compression(
    req: IncomingMessage,
    res: ServerResponse & {
      flush?: () => void
      _header?: { [key: string]: any }
      _implicitHeader?: () => void
    }
  ): void {
    let ended: boolean = false
    let stream: (Transform & Zlib) | null = null
    let listeners: [EventType, Listener][] = []
    let length: number

    const _end = res.end
    const _on = res.on
    const _write = res.write

    res.flush = function flush() {
      if (stream) {
        stream.flush()
      }
    }

    res.write = function write(chunk: any, encoding: BufferEncoding): boolean {
      if (ended) {
        return false
      }

      if (!res._header) {
        res._implicitHeader!()
      }

      return stream
        ? stream.write(toBuffer(chunk, encoding))
        : _write.call(res, chunk, encoding)
    } as typeof _write

    res.end = function end(chunk: any, encoding: BufferEncoding): void {
      if (ended) {
        return
      }

      if (!res._header) {
        if (!res.getHeader('Content-Length')) {
          length = chunkLength(chunk, encoding)
        }
        res._implicitHeader!()
      }

      if (!stream) {
        return _end.call(res, chunk, encoding)
      }

      ended = true

      return chunk ? stream.end(toBuffer(chunk, encoding)) : stream.end()
    } as typeof _end

    res.on = function on(type: EventType, listener: (...args: any[]) => void) {
      if (!listeners || type !== 'drain') {
        return _on.call(res, type, listener)
      }

      if (stream) {
        return (stream.on(type, listener) as unknown) as ServerResponse
      }

      // buffer listeners for future stream
      listeners.push([type, listener])

      return res
    }

    function nocompress() {
      addListeners(res, _on, listeners)
      listeners = []
    }

    onHeaders(res, () => {
      // determine if request is filtered
      if (!filter(req, res)) {
        nocompress()
        return
      }

      // determine if the entity should be transformed
      if (!shouldTransform(req, res)) {
        nocompress()
        return
      }

      // vary
      vary(res, 'Accept-Encoding')

      // content-length below threshold
      const contentLength = Number(res.getHeader('Content-Length'))
      if (
        (!Number.isNaN(contentLength) && contentLength < threshold) ||
        length < threshold
      ) {
        nocompress()
        return
      }

      const encoding = res.getHeader('Content-Encoding') ?? 'identity'

      // already encoded
      if (encoding !== 'identity') {
        nocompress()
        return
      }

      // head
      if (req.method === 'HEAD') {
        nocompress()
        return
      }

      // compression method
      const acceptEncoding = req.headers['accept-encoding']
      const method = Accept.encoding(
        acceptEncoding as string,
        preferredEncodings
      )

      // negotiation failed
      if (method === 'identity') {
        nocompress()
        return
      }

      switch (method) {
        case 'br':
          stream = zlib.createBrotliCompress(opts)
          break
        case 'gzip':
          stream = zlib.createGzip(opts)
          break
        case 'deflate':
          stream = zlib.createDeflate(opts)
          break
        default:
        // Do nothing
      }

      // add buffered listeners to stream
      addListeners(stream!, stream!.on, listeners)

      // header fields
      res.setHeader('Content-Encoding', method)
      res.removeHeader('Content-Length')

      stream!.on('data', (chunk) => {
        if (_write.call(res, chunk, 'utf8') === false) {
          stream!.pause()
        }
      })

      stream!.on('end', () => {
        _end.apply(res)
      })

      _on.call(res, 'drain', () => {
        stream!.resume()
      })
    })
  }

  function addListeners(
    stream: Transform | ServerResponse,
    on: (e: EventType, cb: Listener) => void,
    listeners: [EventType, Listener][]
  ) {
    for (let i = 0; i < listeners.length; i++) {
      on.apply(stream, listeners[i])
    }
  }
}

function toBuffer(chunk: any, encoding: BufferEncoding) {
  return !Buffer.isBuffer(chunk) ? Buffer.from(chunk, encoding) : chunk
}

function shouldCompress(_req: IncomingMessage, res: ServerResponse) {
  const type = res.getHeader('Content-Type')

  if (type === undefined || !compressible(type as string)) {
    return false
  }

  return true
}

function shouldTransform(_req: IncomingMessage, res: ServerResponse) {
  const cacheControl = res.getHeader('Cache-Control')

  // Don't compress for Cache-Control: no-transform
  // https://tools.ietf.org/html/rfc7234#section-5.2.2.4
  return (
    !cacheControl || !cacheControlNoTransformRegExp.test(String(cacheControl))
  )
}

function chunkLength(chunk: any, encoding: BufferEncoding): number {
  if (!chunk) {
    return 0
  }

  return !Buffer.isBuffer(chunk)
    ? Buffer.byteLength(chunk, encoding)
    : chunk.length
}

export default Compression

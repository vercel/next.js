import type { Readable } from 'node:stream'
import { InvariantError } from '../../shared/lib/invariant-error'
import { isNodeNextRequest, isWebNextRequest } from '../base-http/helpers'
import type { NodeNextRequest } from '../base-http/node'
import type { WebNextRequest } from '../base-http/web'

// react puts some special fields at the start of the form data.
// this means we can look for them without reading the whole body, just a small initial part.
// we're looking for something like this:
//
// ------geckoformboundarye7366fc07dbe3dfb120d2ab654d8b5ca<NEWLINE>
// Content-Disposition: form-data; name="$ACTION_REF_1"<NEWLINE>
// <NEWLINE>
// <NEWLINE>
//
// if the action has bound arguments, the field will be called "$ACTION_REF_{num}".
// if it doesn't, it'll be called "$ACTION_ID_{id}" instead.

const ACTION_FORM_FIELD_REGEX =
  /^\r\nContent-Disposition: form-data; name="\$ACTION_(?:REF|ID)_[0-9a-f]+"(?:\r\n){3}/

// we need to find 4 newlines - one after the initial boundary, one after the header row, and two after its value.
const NEWLINE = '\r\n'
const EXPECTED_NEWLINES = 4

function parsePartialBody(body: string, boundaryMarker: string): boolean {
  if (!body.startsWith(boundaryMarker)) {
    return false
  }
  body = body.slice(boundaryMarker.length)

  return ACTION_FORM_FIELD_REGEX.test(body)
}

export async function isMPAactionRequest(
  request: NodeNextRequest
): Promise<[result: boolean, body: NodeNextRequest['body'] | null]>
export async function isMPAactionRequest(
  request: WebNextRequest
): Promise<[result: boolean, body: WebNextRequest['body'] | null]>
export async function isMPAactionRequest(
  request: NodeNextRequest | WebNextRequest
): Promise<
  [
    result: boolean,
    body: NodeNextRequest['body'] | WebNextRequest['body'] | null,
  ]
> {
  const contentType = request.headers['content-type']
  if (contentType === undefined) {
    return [false, null]
  }
  const boundaryMarker = getMultipartBoundaryFromContentType(contentType)
  if (boundaryMarker === null) {
    return [false, null]
  }

  // TODO: check for non-ascii encoding via content-transfer-encoding (https://www.ietf.org/rfc/rfc2388.txt)
  const encoding = 'ascii'

  if (isWebNextRequest(request)) {
    if (!request.body) {
      return [false, request.body]
    }
    const [body1, body2] = request.body.tee()
    const result = await isMpaActionBodyImplEdge(
      body1,
      boundaryMarker,
      encoding
    )
    return [result, body2]
  } else if (isNodeNextRequest(request)) {
    const [body1, body2] = teeNodeReadable(request.body)
    body2.pause()
    const result = await isMpaActionBodyImplNode(
      body1,
      boundaryMarker,
      encoding
    )
    body2.resume()
    return [result, body2]
  } else {
    throw new InvariantError('Unknown request type.')
  }
}

function teeNodeReadable(stream: Readable): [Readable, Readable] {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError('This function cannot be used in the edge runtime')
  } else {
    const { Transform } = require('node:stream') as typeof import('node:stream')
    const teed = new Transform({
      transform(chunk, _encoding, callback) {
        callback(null, chunk)
      },
    })
    stream.pipe(teed)
    stream.on('error', (err) => teed.destroy(err))
    return [stream, teed]
  }
}

async function isMpaActionBodyImplNode(
  body: Readable,
  boundaryMarker: string,
  encoding: BufferEncoding
): Promise<boolean> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError('This function cannot be used in the edge runtime')
  } else {
    return new Promise<boolean>((resolve, reject) => {
      const advanceMatcher = createBodyMatcher(
        boundaryMarker,
        encoding,
        resolve,
        reject
      )

      const onData = (chunk: Buffer) => {
        let done = advanceMatcher(chunk)
        if (done) {
          cleanup()
        }
      }

      const onEnd = () => {
        const done = advanceMatcher(null)
        if (done) {
          cleanup()
        }
      }

      const onError = (err: Error) => {
        cleanup()
        reject(err)
      }

      const cleanup = () => {
        body.off('data', onData)
        body.off('end', onEnd)
        body.off('error', onError)
      }

      body.on('data', onData)
      body.on('end', onEnd)
      body.on('error', onError)
    })
  }
}

export async function isMpaActionBodyImplEdge(
  body: ReadableStream<Uint8Array>,
  boundaryMarker: string,
  encoding: BufferEncoding
): Promise<boolean> {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    throw new InvariantError(
      'This function can only be used in the edge runtime'
    )
  } else {
    return new Promise<boolean>(async (resolve, reject) => {
      const advanceMatcher = createBodyMatcher(
        boundaryMarker,
        encoding,
        resolve,
        reject
      )

      const reader = body.getReader()
      while (true) {
        const read = await reader.read()
        if (!read.done) {
          const chunk = read.value
          const isMatcherDone = advanceMatcher(
            // pass `.buffer` to avoid copying
            Buffer.from(chunk.buffer)
          )
          if (isMatcherDone) {
            // don't await -- the stream was tee'd, so this would block
            // until the other stream is consumed or canceled, resulting in a deadlock
            void reader.cancel()
            break
          }
        } else {
          advanceMatcher(null)
          break
        }
      }
    })
  }
}

function createBodyMatcher(
  boundaryMarker: string,
  encoding: BufferEncoding,
  resolve: (result: boolean) => void,
  reject: (reason: unknown) => void
) {
  const encodedNewline = Buffer.from(NEWLINE, encoding)

  let done = false

  let newlines = 0
  let chunks: Buffer[] = []
  let chunksByteLength = 0

  function finish(result: boolean) {
    done = true
    resolve(result)
    return true
  }

  function advance(chunk: Buffer | null) {
    try {
      return advanceImpl(chunk)
    } catch (err) {
      done = true
      reject(err)
      return true
    }
  }

  function advanceImpl(chunk: Buffer | null): boolean {
    if (done) {
      return true
    }

    if (chunk === null) {
      // we reached the end of the stream without finding the desired amount of newlines.
      // this means this body can't be a match.
      return finish(false)
    }

    // TODO: limit body size. we shouldn't ever exceed it for the initial part of a react form action request.
    chunks.push(chunk)
    chunksByteLength += chunk.length

    // count how many newlines we have in the current chunk.
    // stop looking if we find the number that we want.
    let lastNewlineStartIndexInChunk = -1
    {
      let index = -1
      while (true) {
        index = chunk.indexOf(encodedNewline, index + 1)
        if (index === -1) {
          break
        } else {
          newlines++
          if (newlines === EXPECTED_NEWLINES) {
            lastNewlineStartIndexInChunk = index
            break
          }
        }
      }
    }

    if (lastNewlineStartIndexInChunk === -1) {
      // we didn't find the last newline in this chunk. wait for more.
      return false
    }

    // we have enough bytes to check if the body starts with a react action form field.

    // we'll need the index into a concatenation of all the chunks, not the current chunk.
    // (but we added the current chunk's length to `chunksByteLength` above, so subtract that)
    const lastNewlineStartIndex =
      chunksByteLength - chunk.length + lastNewlineStartIndexInChunk

    const allChunks = chunks.length > 1 ? Buffer.concat(chunks) : chunks[0]
    const partialBodyBytes = allChunks.subarray(
      0,
      lastNewlineStartIndex + encodedNewline.length
    )

    let partialBody: string
    try {
      partialBody = partialBodyBytes.toString(encoding)
    } catch (err) {
      // in a react action request, the leading part should be decodable as a string.
      // if we couldn't decode it, then it has to be something else.
      return finish(false)
    }

    return finish(parsePartialBody(partialBody, boundaryMarker))
  }

  return advance
}

function getMultipartBoundaryFromContentType(contentType: string) {
  if (!contentType.startsWith('multipart/form-data;')) {
    return null
  }
  const boundaryFromHeader = extractMultipartBoundary(contentType)
  if (!boundaryFromHeader) {
    return null
  }

  return '--' + boundaryFromHeader
}

function extractMultipartBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)
  if (!match) return null
  return match[1] ?? match[2]
}

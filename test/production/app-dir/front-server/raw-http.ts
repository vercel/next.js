import net from 'net'

export type RawResponse = {
  status: number
  /** Like `HTTP/1.1 400 Bad Request`. */
  statusLine: string
  /** Header names lowercased, in the order they arrived. */
  headers: ReadonlyArray<readonly [string, string]>
  body: Buffer
}

/**
 * Sends `head` (the request line and headers, without the blank line) and
 * `body` over a fresh TCP connection to 127.0.0.1, byte for byte, and reads
 * the response until the server closes the connection. Unlike `fetch` or
 * `http.request`, nothing normalizes or rejects the request target, so tests
 * can send non-ASCII bytes and malformed escapes as a client would.
 */
export function rawRequest(
  port: number,
  head: string,
  body: Buffer = Buffer.alloc(0)
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1')
    const chunks: Buffer[] = []
    socket.on('data', (chunk: Buffer) => chunks.push(chunk))
    socket.on('error', reject)
    socket.on('end', () => {
      try {
        resolve(parseResponse(Buffer.concat(chunks)))
      } catch (err) {
        reject(err)
      }
    })
    socket.write(
      Buffer.concat([
        Buffer.from(`${head}\r\nConnection: close\r\n\r\n`, 'utf8'),
        body,
      ])
    )
  })
}

function parseResponse(raw: Buffer): RawResponse {
  const headEnd = raw.indexOf('\r\n\r\n')
  if (headEnd === -1) {
    throw new Error(`Incomplete response: ${JSON.stringify(raw.toString())}`)
  }
  const [statusLine, ...headerLines] = raw
    .subarray(0, headEnd)
    .toString('latin1')
    .split('\r\n')
  const headers = headerLines.map((line) => {
    const colon = line.indexOf(':')
    return [
      line.slice(0, colon).toLowerCase(),
      line.slice(colon + 1).trim(),
    ] as const
  })
  const rest = raw.subarray(headEnd + 4)
  const isChunked = headers.some(
    ([name, value]) => name === 'transfer-encoding' && value === 'chunked'
  )
  return {
    status: Number(statusLine.split(' ')[1]),
    statusLine,
    headers,
    body: isChunked ? decodeChunked(rest) : rest,
  }
}

function decodeChunked(raw: Buffer): Buffer {
  const parts: Buffer[] = []
  let offset = 0
  while (offset < raw.length) {
    const lineEnd = raw.indexOf('\r\n', offset)
    const size = parseInt(raw.subarray(offset, lineEnd).toString(), 16)
    if (!size) break
    parts.push(raw.subarray(lineEnd + 2, lineEnd + 2 + size))
    offset = lineEnd + 2 + size + 2
  }
  return Buffer.concat(parts)
}

export function getHeader(
  response: RawResponse,
  name: string
): string | undefined {
  return response.headers.find(([key]) => key === name)?.[1]
}

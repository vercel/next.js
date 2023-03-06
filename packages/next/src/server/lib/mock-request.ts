import Stream from 'stream'

export function mockRequest(
  requestUrl: string,
  requestHeaders: Record<string, string | string[] | undefined>,
  requestMethod: string,
  requestConnection?: any
) {
  const resBuffers: Buffer[] = []
  const mockRes: any = new Stream.Writable()

  const isStreamFinished = new Promise(function (resolve, reject) {
    mockRes.on('finish', () => resolve(true))
    mockRes.on('end', () => resolve(true))
    mockRes.on('error', (err: any) => reject(err))
  })

  mockRes.write = (chunk: Buffer | string) => {
    resBuffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  mockRes._write = (
    chunk: Buffer | string,
    _encoding: string,
    callback: () => void
  ) => {
    mockRes.write(chunk)
    // According to Node.js documentation, the callback MUST be invoked to signal that
    // the write completed successfully. If this callback is not invoked, the 'finish' event
    // will not be emitted.
    // https://nodejs.org/docs/latest-v16.x/api/stream.html#writable_writechunk-encoding-callback
    callback()
  }

  const mockHeaders: Record<string, string | string[]> = {}

  mockRes.writeHead = (_status: any, _headers: any) =>
    Object.assign(mockHeaders, _headers)
  mockRes.hasHeader = (name: string) => Boolean(mockHeaders[name.toLowerCase()])
  mockRes.getHeader = (name: string) => mockHeaders[name.toLowerCase()]
  mockRes.getHeaders = () => mockHeaders
  mockRes.getHeaderNames = () => Object.keys(mockHeaders)
  mockRes.setHeader = (name: string, value: string | string[]) =>
    (mockHeaders[name.toLowerCase()] = value)
  mockRes.removeHeader = (name: string) => {
    delete mockHeaders[name.toLowerCase()]
  }
  mockRes._implicitHeader = () => {}
  mockRes.connection = requestConnection
  mockRes.finished = false
  mockRes.statusCode = 200

  const mockReq: any = new Stream.Readable()

  mockReq._read = () => {
    mockReq.emit('end')
    mockReq.emit('close')
    return Buffer.from('')
  }

  mockReq.headers = requestHeaders
  mockReq.method = requestMethod
  mockReq.url = requestUrl
  mockReq.connection = requestConnection

  return {
    resBuffers,
    req: mockReq,
    res: mockRes,
    streamPromise: isStreamFinished,
  }
}

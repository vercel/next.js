import { IncomingMessage, ServerResponse } from 'http'
import { PassThrough } from 'stream'

const SYMBOL_NEXT_REQUEST = Symbol('NEXT_REQUEST')

export interface NextHttpRequest extends IncomingMessage {
  readonly [SYMBOL_NEXT_REQUEST]: boolean
}

export interface NextHttpResponse extends ServerResponse {
  readonly [SYMBOL_NEXT_REQUEST]: boolean
}

export async function withUnbufferedRequest(
  req: IncomingMessage,
  res: ServerResponse,
  callback: (req: NextHttpRequest, res: NextHttpResponse) => Promise<void>
): Promise<void> {
  return await callback(req as any, res as any)
}

export async function withBufferedRequest(
  req: IncomingMessage,
  res: ServerResponse,
  callback: (req: NextHttpRequest, res: NextHttpResponse) => Promise<void>
): Promise<Buffer> {
  const {
    end: oldEnd,
    finished: oldFinished,
    headersSent: oldHeadersSent,
    write: oldWrite,
  } = res
  const chunks: Buffer[] = []
  const stream = new PassThrough({
    transform(chunk, _encoding, callback) {
      chunks.push(chunk)
      return callback()
    },
  })
  try {
    ;(res as any).end = () => {
      stream.end(...arguments)
      res.finished = true
    }
    ;(res as any).write = () => {
      ;(stream as any).write(...arguments)
      res.headersSent = true
    }
    await callback(req as any, res as any)
    return Buffer.concat(chunks)
  } finally {
    res.end = oldEnd
    res.write = oldWrite
    res.finished = oldFinished
    res.headersSent = oldHeadersSent
  }
}

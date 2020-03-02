import { IncomingMessage, ServerResponse } from 'http'
import { PassThrough } from 'stream'

const SYMBOL_NEXT_REQUEST = Symbol('NEXT_REQUEST')

export interface NextHttpRequest extends IncomingMessage {
  readonly [SYMBOL_NEXT_REQUEST]: boolean
}

export interface NextHttpResponse extends ServerResponse {
  readonly [SYMBOL_NEXT_REQUEST]: ResponseState | null
}

type ResponseState = {
  sent: boolean
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
  const { end: oldEnd, write: oldWrite } = res
  const chunks: Buffer[] = []
  const stream = new PassThrough({
    transform(chunk, _encoding, callback) {
      chunks.push(chunk)
      return callback()
    },
  })
  try {
    const state: ResponseState = {
      sent: false,
    }
    ;(res as any).end = (...args: any) => {
      stream.end(...args)
      state.sent = true
    }
    ;(res as any).write = (...args: any) => {
      ;(stream as any).write(...args)
      state.sent = true
    }
    ;(res as any)[SYMBOL_NEXT_REQUEST] = state
    await callback(req as any, res as any)
    return Buffer.concat(chunks)
  } finally {
    delete (res as any)[SYMBOL_NEXT_REQUEST]
    res.end = oldEnd
    res.write = oldWrite
  }
}

export function isResSent(res: NextHttpResponse) {
  const state = res[SYMBOL_NEXT_REQUEST]
  if (state) {
    return state.sent
  }
  return res.finished || res.headersSent
}

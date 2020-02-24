import { ServerResponse } from 'http'
import { isResSent } from '../lib/utils'

/**
 * This is a PRIVATE API. It should not be exposed.
 */
export interface NextResponse {
  rawResponse: ServerResponse
  isSent(): boolean

  end(chunk?: any): void
  statusCode: number
  setHeader(name: string, value: string | number | string[]): void
  getHeader(name: string): string | number | string[] | undefined
}

export function createPassthroughResponse(res: ServerResponse): NextResponse {
  const proxy: NextResponse = {
    statusCode: 200,
    rawResponse: res,
    end: chunk => res.end(chunk),
    isSent: () => isResSent(res),
    setHeader: (name, value) => res.setHeader(name, value),
    getHeader: name => res.getHeader(name),
  }
  Object.defineProperty(proxy, 'statusCode', {
    get() {
      return res.statusCode
    },
    set(value) {
      res.statusCode = value
    },
  })
  return proxy
}

import { ServerResponse } from 'http'
import { isResSent } from '../lib/utils'

export interface ResponseLike {
  rawResponse: ServerResponse

  end(chunk?: any): void
  getHeader(name: string): string | number | string[] | undefined
  getStatusCode(): number
  hasSent(): boolean
  set(name: string, value: number | string | string[]): ResponseLike
  status(statusCode: number): ResponseLike
}

export class PassthroughResponse implements ResponseLike {
  rawResponse: ServerResponse

  constructor(res: ServerResponse) {
    this.rawResponse = res
  }

  end(chunk: any): void {
    this.rawResponse.end(chunk)
  }

  getHeader(name: string): string | number | string[] | undefined {
    return this.rawResponse.getHeader(name)
  }

  getStatusCode(): number {
    return this.rawResponse.statusCode
  }

  hasSent(): boolean {
    return isResSent(this.rawResponse)
  }

  set(name: string, value: number | string | string[]): ResponseLike {
    this.rawResponse.setHeader(name, value)
    return this
  }

  status(statusCode: number): ResponseLike {
    this.rawResponse.statusCode = statusCode
    return this
  }
}

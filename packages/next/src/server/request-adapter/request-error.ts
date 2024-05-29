import type { NextParsedUrlQuery } from '../request-meta'

export class RequestError {
  constructor(
    public readonly statusCode: number,
    public readonly cause: Error | null,
    public readonly query: NextParsedUrlQuery
  ) {}
}

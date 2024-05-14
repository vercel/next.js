import type { FetchEventResult } from '../../web/types'

export class BubbledError extends Error {
  constructor(
    public readonly bubble?: boolean,
    public readonly result?: FetchEventResult
  ) {
    super()
  }
}

export function isBubbledError(error: unknown): error is BubbledError {
  if (typeof error !== 'object' || error === null) return false
  return error instanceof BubbledError
}

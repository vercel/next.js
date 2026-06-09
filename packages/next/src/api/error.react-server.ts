export function unstable_catchError(): never {
  throw new Error(
    '`unstable_catchError` can only be used in Client Components.'
  )
}

export type { ErrorInfo } from '../client/components/error-boundary'

import { isPlainObject } from '../shared/lib/is-plain-object'

// We allow some additional attached properties for Errors
export interface NextError extends Error {
  type?: string
  page?: string
  code?: string | number
  cancelled?: boolean
  digest?: number
}

export default function isError(err: unknown): err is NextError {
  return (
    typeof err === 'object' && err !== null && 'name' in err && 'message' in err
  )
}

export function getProperError(err: unknown): Error {
  if (isError(err)) {
    return err
  }

  if (process.env.NODE_ENV === 'development') {
    // provide better error for case where `throw undefined`
    // is called in development
    if (typeof err === 'undefined') {
      return new Error(
        'An undefined error was thrown, ' +
          'see here for more info: https://nextjs.org/docs/messages/threw-undefined'
      )
    }

    if (err === null) {
      return new Error(
        'A null error was thrown, ' +
          'see here for more info: https://nextjs.org/docs/messages/threw-undefined'
      )
    }
  }

  return new Error(isPlainObject(err) ? JSON.stringify(err) : err + '')
}

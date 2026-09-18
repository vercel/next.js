export function catchError(): never {
  throw new Error('`catchError` can only be used in Client Components.')
}

export * as default from './error.react-server'

export type { ErrorInfo } from '../client/components/error-boundary'

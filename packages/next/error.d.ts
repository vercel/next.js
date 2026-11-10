// Default export is Pages Router only
import Error from './dist/api/error'
export * from './dist/api/error'
export default Error

export { catchError } from './dist/api/error'
export type { ErrorInfo } from './dist/api/error'

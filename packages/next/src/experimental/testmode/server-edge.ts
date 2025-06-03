import { withRequest as withRequestContext } from './context'
import { interceptFetch, reader } from './fetch'

export function interceptTestApis(): () => void {
  return interceptFetch(global.fetch)
}

export function wrapRequestHandler<T, TRequest extends Request>(
  handler: (req: TRequest, fn: () => T) => T
): (req: TRequest, fn: () => T) => T {
  return (req, fn) => withRequestContext(req, reader, () => handler(req, fn))
}

import { stringifyRequest } from '../../stringify-request'

export function getStringifiedAbsolutePath(target: any, path: string) {
  return stringifyRequest(
    target,
    target.utils.absolutify(target.rootContext, path)
  )
}

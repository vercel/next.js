import loaderUtils from 'next/dist/compiled/loader-utils'

export function getStringifiedAbsolutePath(target: any, path: string) {
  return loaderUtils.stringifyRequest(
    target,
    target.utils.absolutify(target.rootContext, path)
  )
}

import loaderUtils from 'next/dist/compiled/loader-utils'

export function getStringifiedAbsolutePath(target: any, path: string) {
  return loaderUtils.stringifyRequest(
    target,
    target.utils.absolutify(target.rootContext, path)
  )
}

export function getStringifiedServerPath(target: any, path: string) {
  return loaderUtils.stringifyRequest(
    target,
    target.utils.absolutify(target._compilation.outputOptions.path, path)
  )
}

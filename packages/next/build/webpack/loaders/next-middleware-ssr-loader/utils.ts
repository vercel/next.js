function stringifyRequest(loaderContext: any, request: any) {
  return JSON.stringify(
    loaderContext.utils.contextify(
      loaderContext.context || loaderContext.rootContext,
      request
    )
  )
}

export function getStringifiedAbsolutePath(target: any, path: string) {
  return stringifyRequest(
    target,
    target.utils.absolutify(target.rootContext, path)
  )
}

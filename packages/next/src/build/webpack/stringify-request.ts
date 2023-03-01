export function stringifyRequest(loaderContext: any, request: any) {
  return JSON.stringify(
    loaderContext.utils.contextify(
      loaderContext.context || loaderContext.rootContext,
      request
    )
  )
}

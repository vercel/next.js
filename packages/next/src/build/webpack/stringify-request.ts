import type webpack from 'webpack'

export function stringifyRequest(
  loaderContext: webpack.LoaderContext<any>,
  request: string
) {
  return JSON.stringify(
    loaderContext.utils.contextify(
      loaderContext.context || loaderContext.rootContext,
      request
    )
  )
}

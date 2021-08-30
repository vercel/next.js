import { getOptions } from 'next/dist/compiled/loader-utils'
import { Span } from '../../../telemetry/trace'
import transform from './transform'
import { NextJsLoaderContext } from './types'

async function nextBabelLoader(
  this: NextJsLoaderContext,
  parentTrace: Span,
  inputSource: string,
  inputSourceMap: object | null | undefined
) {
  const filename = this.resourcePath
  const target = this.target
  const loaderOptions = parentTrace
    .traceChild('get-options')
    .traceFn(() => getOptions(this))

  const loaderSpanInner = parentTrace.traceChild('next-babel-turbo-transform')
  const { code: transformedSource, map: outputSourceMap } =
    loaderSpanInner.traceFn(() =>
      transform.call(
        this,
        inputSource,
        inputSourceMap,
        loaderOptions,
        filename,
        target,
        loaderSpanInner
      )
    )

  return [transformedSource, outputSourceMap]
}

const nextBabelLoaderOuter = function nextBabelLoaderOuter(
  this: NextJsLoaderContext,
  inputSource: string,
  inputSourceMap: object | null | undefined
) {
  const callback = this.async()

  const loaderSpan = this.currentTraceSpan.traceChild('next-babel-turbo-loader')
  loaderSpan
    .traceAsyncFn(() =>
      nextBabelLoader.call(this, loaderSpan, inputSource, inputSourceMap)
    )
    .then(
      ([transformedSource, outputSourceMap]) =>
        callback?.(null, transformedSource, outputSourceMap || inputSourceMap),
      (err) => {
        callback?.(err)
      }
    )
}

export default nextBabelLoaderOuter

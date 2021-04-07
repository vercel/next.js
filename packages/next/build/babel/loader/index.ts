import { inspect } from 'util'
import { getOptions } from 'loader-utils'
import { trace } from '../../../telemetry/trace'
import { Span } from '../../../telemetry/trace'
import transform from './transform'
import { NextJsLoaderContext } from './types'

async function nextBabelLoader(
  this: NextJsLoaderContext,
  parentTrace: Span,
  inputSource: string,
  inputSourceMap: string
) {
  const filename = this.resourcePath
  const target = this.target
  const loaderOptions = parentTrace
    .traceChild('get-options')
    .traceFn(() => getOptions(this))

  const loaderSpanInner = parentTrace.traceChild('next-babel-turbo-transform')
  const {
    code: transformedSource,
    map: outputSourceMap,
  } = loaderSpanInner.traceFn(() =>
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
  inputSourceMap: string
) {
  const callback = this.async()

  const loaderSpan = trace('next-babel-turbo-loader', this.currentTraceSpan?.id)
  loaderSpan
    .traceAsyncFn(() =>
      nextBabelLoader.call(this, loaderSpan, inputSource, inputSourceMap)
    )
    .then(
      ([transformedSource, outputSourceMap]) =>
        callback?.(null, transformedSource, outputSourceMap || inputSourceMap),
      (err) => {
        console.error(
          `Problem encountered in next-babel-turbo-loader. \n${inspect(err)}`
        )
        callback?.(err)
      }
    )
}

export default nextBabelLoaderOuter

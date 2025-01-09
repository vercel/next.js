import type { Span } from '../../../trace'
import transform from './transform'
import type { NextJsLoaderContext } from './types'

async function nextBabelLoader(
  this: NextJsLoaderContext,
  parentTrace: Span,
  inputSource: string,
  inputSourceMap: object | null | undefined
) {
  const filename = this.resourcePath

  // Ensure `.d.ts` are not processed.
  if (filename.endsWith('.d.ts')) {
    return [inputSource, inputSourceMap]
  }

  const target = this.target
  const loaderOptions: any = parentTrace
    .traceChild('get-options')
    // @ts-ignore TODO: remove ignore once webpack 5 types are used
    .traceFn(() => this.getOptions())

  if (loaderOptions.exclude && loaderOptions.exclude(filename)) {
    return [inputSource, inputSourceMap]
  }

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
      ([transformedSource, outputSourceMap]: any) =>
        callback?.(null, transformedSource, outputSourceMap || inputSourceMap),
      (err) => {
        callback?.(err)
      }
    )
}

export default nextBabelLoaderOuter

import type { Span } from '../../../trace'
import transform from './transform'
import type { NextJsLoaderContext } from './types'
import type { SourceMap } from './util'
import type { webpack } from 'next/dist/compiled/webpack/webpack'

async function nextBabelLoader(
  ctx: NextJsLoaderContext,
  parentTrace: Span,
  inputSource: string,
  inputSourceMap: SourceMap | null | undefined
): Promise<[string, SourceMap | null | undefined]> {
  const filename = ctx.resourcePath

  // Ensure `.d.ts` are not processed.
  if (filename.endsWith('.d.ts')) {
    return [inputSource, inputSourceMap]
  }

  const target = ctx.target
  const loaderOptions: any = parentTrace
    .traceChild('get-options')
    // @ts-ignore TODO: remove ignore once webpack 5 types are used
    .traceFn(() => ctx.getOptions())

  if (loaderOptions.exclude && loaderOptions.exclude(filename)) {
    return [inputSource, inputSourceMap]
  }

  const loaderSpanInner = parentTrace.traceChild('next-babel-turbo-transform')
  const { code: transformedSource, map: outputSourceMap } =
    await loaderSpanInner.traceAsyncFn(
      async () =>
        await transform(
          ctx,
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

function nextBabelLoaderOuter(
  this: NextJsLoaderContext,
  inputSource: string,
  // webpack's source map format is compatible with babel, but the type signature doesn't match
  inputSourceMap?: any
) {
  const callback = this.async()

  const loaderSpan = this.currentTraceSpan.traceChild('next-babel-turbo-loader')
  loaderSpan
    .traceAsyncFn(() =>
      nextBabelLoader(this, loaderSpan, inputSource, inputSourceMap)
    )
    .then(
      ([transformedSource, outputSourceMap]) =>
        callback?.(
          /* err */ null,
          transformedSource,
          outputSourceMap ?? inputSourceMap
        ),
      (err) => {
        callback?.(err)
      }
    )
}

// check this type matches `webpack.LoaderDefinitionFunction`, but be careful
// not to publicly rely on the webpack type since the generated typescript
// declarations will be wrong.
const _nextBabelLoaderOuter: webpack.LoaderDefinitionFunction<
  {},
  NextJsLoaderContext
> = nextBabelLoaderOuter

export default nextBabelLoaderOuter

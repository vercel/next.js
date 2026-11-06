import type { Span } from '@opentelemetry/api'
import { traceLocalSpan } from '../../../server/lib/trace/local-span-recorder'
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
  const loaderOptions: any = traceLocalSpan(
    {
      name: 'get-options',
      parent: parentTrace,
      synchronous: true,
    },
    () => ctx.getOptions()
  )

  if (loaderOptions.exclude && loaderOptions.exclude(filename)) {
    return [inputSource, inputSourceMap]
  }

  const { code: transformedSource, map: outputSourceMap } =
    await traceLocalSpan(
      {
        name: 'next-babel-turbo-transform',
        parent: parentTrace,
      },
      async (loaderSpanInner) =>
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

  traceLocalSpan(
    {
      name: 'next-babel-turbo-loader',
      parent: this.currentTraceSpan,
    },
    (loaderSpan) =>
      nextBabelLoader(this, loaderSpan, inputSource, inputSourceMap)
  ).then(
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

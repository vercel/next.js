import { inspect } from 'util'
import { trace } from '../../../telemetry/trace'

import transform from './transform'

async function nextBabelLoader(parentTrace, inputSource, inputSourceMap) {
  const filename = this.resourcePath
  const target = this.target
  const loaderOptions = this.getOptions()

  // TODO: farm out to worker threads
  // TODO: affinitize file paths to threads, if determining options can be done once
  //       but necessarily in the worker thread.
  // TODO: if it is a rebuild, don't farm work out to a worker.
  const {
    code: transformedSource,
    map: outputSourceMap,
  } = parentTrace
    .traceChild('next-babel-turbo-transform')
    .traceFn(() =>
      transform(inputSource, inputSourceMap, loaderOptions, filename, target)
    )

  return [transformedSource, outputSourceMap]
}

const nextBabelLoaderOuter = function nextBabelLoaderOuter(
  inputSource,
  inputSourceMap,
  meta
) {
  const callback = this.async()

  const loaderSpan = trace('next-babel-turbo-loader', this.currentTraceSpan?.id)
  loaderSpan
    .traceAsyncFn(() =>
      nextBabelLoader.call(this, loaderSpan, inputSource, inputSourceMap)
    )
    .then(
      ([transformedSource, outputSourceMap]) =>
        callback(
          null,
          transformedSource,
          outputSourceMap || inputSourceMap,
          meta
        ),
      (err) => {
        console.error(
          `Problem encountered in next-babel-turbo-loader. \n${inspect(err)}`
        )
        callback(err)
      }
    )
}

// Ask Webpack for a buffer instead of a UTF-8 string.
// nextBabelLoader.raw = true

export default nextBabelLoaderOuter

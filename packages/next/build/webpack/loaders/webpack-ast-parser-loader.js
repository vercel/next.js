import { webpackAST } from '../../swc'
import { isAbsolute } from 'path'

export default function swcLoader(inputSource, inputSourceMap) {
  const resourcePath = this.resourcePath

  if (!isAbsolute(resourcePath)) {
    return inputSource
  }

  const callback = this.async()

  const loaderSpan = this.currentTraceSpan.traceChild('next-swc-loader')
  loaderSpan
    .traceAsyncFn(() => webpackAST(resourcePath))
    .then(
      (webpackAST) => {
        callback(null, inputSource, inputSourceMap, { webpackAST })
      },
      (err) => {
        callback(err)
      }
    )
}

// accept Buffers instead of strings
export const raw = true

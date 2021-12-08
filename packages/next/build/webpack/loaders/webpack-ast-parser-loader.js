import { webpackAST } from '../../swc'
import { isAbsolute } from 'path'

export default function swcLoader(inputSource, inputSourceMap) {
  const resourcePath = this.resourcePath

  if (!isAbsolute(resourcePath)) {
    return inputSource
  }

  const callback = this.async()

  const loaderSpan = this.currentTraceSpan.traceChild('next-ast-loader')
  loaderSpan
    .traceAsyncFn(() => webpackAST(resourcePath, loaderSpan))
    .then(
      (ast) => {
        callback(null, inputSource, inputSourceMap, { webpackAST: ast })
      },
      (err) => {
        callback(err)
      }
    )
}

// accept Buffers instead of strings
export const raw = true

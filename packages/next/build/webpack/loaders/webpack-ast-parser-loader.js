import { isWasm, webpackAST } from '../../swc'
import { isAbsolute } from 'path'
import { EXCLUDED_PATHS } from './next-swc-loader'

export function pitch() {
  const callback = this.async()
  ;(async () => {
    if (
      !EXCLUDED_PATHS.test(this.resourcePath) &&
      this.loaders.length - 1 === this.loaderIndex &&
      isAbsolute(this.resourcePath) &&
      !(await isWasm())
    ) {
      const loaderSpan = this.currentTraceSpan.traceChild('next-ast-loader')
      this.addDependency(this.resourcePath)
      return loaderSpan.traceAsyncFn(() => webpackAST(this.resourcePath, true))
    }
  })().then((result) => {
    if (result) {
      return callback(null, result[1] || null, null, { webpackAST: result[0] })
    }
    callback()
  }, callback)
}

// accept Buffers instead of strings
export const raw = true

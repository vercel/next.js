import type { webpack } from 'next/dist/compiled/webpack/webpack'
import path from 'path'

export default function nextErrorBrowserBinaryLoader(
  this: webpack.LoaderContext<any>
) {
  let relativePath = path.relative(this.rootContext, this.resourcePath)
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath
  }
  return `module.exports = __non_webpack_require__(${JSON.stringify(relativePath)})`
}

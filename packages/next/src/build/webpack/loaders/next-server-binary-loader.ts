import type { webpack } from 'next/dist/compiled/webpack/webpack'
import path from 'path'

export default function nextServerBinaryLoader(
  this: webpack.LoaderContext<any>
) {
  // TODO: how can we know if the package's "imports" even lets us directly require the file like that?
  const pathFromProjectRoot = path.relative(this.rootContext, this.resourcePath)
  return `
const path = require('path');
const moduleAbsPath = path.resolve(process.cwd(), ${JSON.stringify(pathFromProjectRoot)});
module.exports = __non_webpack_require__(moduleAbsPath);
`
}

import type { webpack } from 'next/dist/compiled/webpack/webpack'

export default function nextServerBinaryLoader(
  this: webpack.LoaderContext<any>
) {
  // TODO: figure out how to relativize this (but how can we know where the module will end up on disk?)
  // also, how can we know if the package's "imports" even lets us directly require the file like that?
  const importPath = this.resourcePath
  return `module.exports = __non_webpack_require__(${JSON.stringify(importPath)})`
}

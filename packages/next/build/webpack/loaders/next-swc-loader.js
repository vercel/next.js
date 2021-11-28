/*
Copyright (c) 2017 The swc Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
*/

import { transform } from '../../swc'
import { getLoaderSWCOptions } from '../../swc/options'
import { isAbsolute } from 'path'

async function loaderTransform(parentTrace, source, inputSourceMap) {
  // Make the loader async
  const filename = this.resourcePath

  let loaderOptions = this.getOptions() || {}

  const { isServer, pagesDir, hasReactRefresh, nextConfig, jsConfig } =
    loaderOptions
  const isPageFile = filename.startsWith(pagesDir)

  const swcOptions = getLoaderSWCOptions({
    pagesDir,
    filename,
    isServer: isServer,
    isPageFile,
    development: this.mode === 'development',
    hasReactRefresh,
    nextConfig,
    jsConfig,
  })

  const programmaticOptions = {
    ...swcOptions,
    filename,
    inputSourceMap: inputSourceMap ? JSON.stringify(inputSourceMap) : undefined,

    // Set the default sourcemap behavior based on Webpack's mapping flag,
    sourceMaps: this.sourceMap,
    inlineSourcesContent: this.sourceMap,

    // Ensure that Webpack will get a full absolute path in the sourcemap
    // so that it can properly map the module back to its internal cached
    // modules.
    sourceFileName: filename,
  }

  if (!programmaticOptions.inputSourceMap) {
    delete programmaticOptions.inputSourceMap
  }

  // auto detect development mode
  if (
    this.mode &&
    programmaticOptions.jsc &&
    programmaticOptions.jsc.transform &&
    programmaticOptions.jsc.transform.react &&
    !Object.prototype.hasOwnProperty.call(
      programmaticOptions.jsc.transform.react,
      'development'
    )
  ) {
    programmaticOptions.jsc.transform.react.development =
      this.mode === 'development'
  }

  const swcSpan = parentTrace.traceChild('next-swc-transform')
  return swcSpan.traceAsyncFn(() =>
    transform(source, programmaticOptions).then((output) => {
      return [output.code, output.map ? JSON.parse(output.map) : undefined]
    })
  )
}

export function pitch() {
  if (
    this.loaders.length - 1 === this.loaderIndex &&
    isAbsolute(this.resourcePath)
  ) {
    const loaderSpan = this.currentTraceSpan.traceChild('next-swc-loader')
    const callback = this.async()
    loaderSpan
      .traceAsyncFn(() => loaderTransform.call(this, loaderSpan))
      .then(
        ([transformedSource, outputSourceMap]) => {
          this.addDependency(this.resourcePath)
          callback(null, transformedSource, outputSourceMap)
        },
        (err) => {
          this.addDependency(this.resourcePath)
          callback(err)
        }
      )
  }
}

export default function swcLoader(inputSource, inputSourceMap) {
  const loaderSpan = this.currentTraceSpan.traceChild('next-swc-loader')
  const callback = this.async()
  loaderSpan
    .traceAsyncFn(() =>
      loaderTransform.call(this, loaderSpan, inputSource, inputSourceMap)
    )
    .then(
      ([transformedSource, outputSourceMap]) => {
        callback(null, transformedSource, outputSourceMap || inputSourceMap)
      },
      (err) => {
        callback(err)
      }
    )
}

// accept Buffers instead of strings
export const raw = true

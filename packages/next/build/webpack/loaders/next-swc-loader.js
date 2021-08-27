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

import { getOptions } from 'next/dist/compiled/loader-utils'
import { transform } from '../../swc'

function getSWCOptions({ isTypeScript, isServer, development }) {
  const jsc = {
    parser: {
      syntax: isTypeScript ? 'typescript' : 'ecmascript',
      dynamicImport: true,
      [isTypeScript ? 'tsx' : 'jsx']: true,
    },

    transform: {
      react: {
        runtime: 'automatic',
        pragma: 'React.createElement',
        pragmaFrag: 'React.Fragment',
        throwIfNamespace: true,
        development: development,
        useBuiltins: true,
      },
    },
  }

  if (isServer) {
    return {
      jsc,
      env: {
        targets: {
          // Targets the current version of Node.js
          node: process.versions.node,
        },
      },
    }
  } else {
    // Matches default @babel/preset-env behavior
    jsc.target = 'es5'
    return { jsc }
  }
}

async function loaderTransform(parentTrace, source, inputSourceMap) {
  // Make the loader async
  const filename = this.resourcePath

  const isTypeScript = filename.endsWith('.ts') || filename.endsWith('.tsx')

  let loaderOptions = getOptions(this) || {}

  const swcOptions = getSWCOptions({
    isTypeScript,
    isServer: loaderOptions.isServer,
    development: this.mode === 'development',
  })

  const programmaticOptions = {
    ...swcOptions,
    filename,
    inputSourceMap: inputSourceMap ? JSON.stringify(inputSourceMap) : undefined,

    // Set the default sourcemap behavior based on Webpack's mapping flag,
    sourceMaps: this.sourceMap,

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

export default function swcLoader(inputSource, inputSourceMap) {
  const loaderSpan = this.currentTraceSpan.traceChild('next-swc-loader')
  const callback = this.async()
  loaderSpan
    .traceAsyncFn(() =>
      loaderTransform.call(this, loaderSpan, inputSource, inputSourceMap)
    )
    .then(
      ([transformedSource, outputSourceMap]) =>
        callback?.(null, transformedSource, outputSourceMap || inputSourceMap),
      (err) => {
        callback?.(err)
      }
    )
}

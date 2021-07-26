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
const { transform, transformSync } = require('../../swc/core')

function makeLoader() {
  return function (source, inputSourceMap) {
    // Make the loader async
    const callback = this.async()
    const filename = this.resourcePath

    let loaderOptions = getOptions(this) || {}

    // Standardize on 'sourceMaps' as the key passed through to Webpack, so that
    // users may safely use either one alongside our default use of
    // 'this.sourceMap' below without getting error about conflicting aliases.
    if (
      Object.prototype.hasOwnProperty.call(loaderOptions, 'sourceMap') &&
      !Object.prototype.hasOwnProperty.call(loaderOptions, 'sourceMaps')
    ) {
      loaderOptions = Object.assign({}, loaderOptions, {
        sourceMaps: loaderOptions.sourceMap,
      })
      delete loaderOptions.sourceMap
    }

    if (inputSourceMap) {
      inputSourceMap = JSON.stringify(inputSourceMap)
    }

    const programmaticOptions = Object.assign({}, loaderOptions, {
      filename,
      inputSourceMap: inputSourceMap || undefined,

      // Set the default sourcemap behavior based on Webpack's mapping flag,
      // but allow users to override if they want.
      sourceMaps:
        loaderOptions.sourceMaps === undefined
          ? this.sourceMap
          : loaderOptions.sourceMaps,

      // Ensure that Webpack will get a full absolute path in the sourcemap
      // so that it can properly map the module back to its internal cached
      // modules.
      sourceFileName: filename,
    })
    if (!programmaticOptions.inputSourceMap) {
      delete programmaticOptions.inputSourceMap
    }

    const sync = programmaticOptions.sync
    const parseMap = programmaticOptions.parseMap

    // Remove loader related options
    delete programmaticOptions.sync
    delete programmaticOptions.parseMap
    delete programmaticOptions.customize
    delete programmaticOptions.cacheDirectory
    delete programmaticOptions.cacheIdentifier
    delete programmaticOptions.cacheCompression
    delete programmaticOptions.metadataSubscribers

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

    if (programmaticOptions.sourceMaps === 'inline') {
      // Babel has this weird behavior where if you set "inline", we
      // inline the sourcemap, and set 'result.map = null'. This results
      // in bad behavior from Babel since the maps get put into the code,
      // which Webpack does not expect, and because the map we return to
      // Webpack is null, which is also bad. To avoid that, we override the
      // behavior here so "inline" just behaves like 'true'.
      programmaticOptions.sourceMaps = true
    }

    try {
      if (sync) {
        const output = transformSync(source, programmaticOptions)
        callback(
          null,
          output.code,
          parseMap ? JSON.parse(output.map) : output.map
        )
      } else {
        transform(source, programmaticOptions).then(
          (output) => {
            callback(
              null,
              output.code,
              parseMap ? JSON.parse(output.map) : output.map
            )
          },
          (err) => {
            callback(err)
          }
        )
      }
    } catch (e) {
      callback(e)
    }
  }
}

module.exports = makeLoader()
module.exports.custom = makeLoader

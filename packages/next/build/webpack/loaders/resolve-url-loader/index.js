/*
The MIT License (MIT)

Copyright (c) 2016 Ben Holloway

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { SourceMapConsumer } from 'next/dist/compiled/source-map'
import valueProcessor from './lib/value-processor'
import { defaultJoin } from './lib/join-function'
import process from './lib/postcss'
/**
 * A webpack loader that resolves absolute url() paths relative to their original source file.
 * Requires source-maps to do any meaningful work.
 * @param {string} content Css content
 * @param {object} sourceMap The source-map
 * @returns {string|String}
 */
export default async function resolveUrlLoader(content, sourceMap) {
  const options = Object.assign(
    {
      sourceMap: this.sourceMap,
      silent: false,
      absolute: false,
      keepQuery: false,
      root: false,
      debug: false,
      join: defaultJoin,
    },
    this.getOptions()
  )

  let sourceMapConsumer
  if (sourceMap) {
    sourceMapConsumer = new SourceMapConsumer(sourceMap)
  }

  const callback = this.async()
  const { postcss } = await options.postcss()
  process(postcss, this.resourcePath, content, {
    outputSourceMap: Boolean(options.sourceMap),
    transformDeclaration: valueProcessor(this.resourcePath, options),
    inputSourceMap: sourceMap,
    sourceMapConsumer: sourceMapConsumer,
  })
    .catch(onFailure)
    .then(onSuccess)

  function onFailure(error) {
    callback(encodeError('CSS error', error))
  }

  function onSuccess(reworked) {
    if (reworked) {
      // complete with source-map
      //  source-map sources are relative to the file being processed
      if (options.sourceMap) {
        callback(null, reworked.content, reworked.map)
      }
      // complete without source-map
      else {
        callback(null, reworked.content)
      }
    }
  }

  function encodeError(label, exception) {
    return new Error(
      [
        'resolve-url-loader',
        ': ',
        [label]
          .concat(
            (typeof exception === 'string' && exception) ||
              (exception instanceof Error && [
                exception.message,
                exception.stack.split('\n')[1].trim(),
              ]) ||
              []
          )
          .filter(Boolean)
          .join('\n  '),
      ].join('')
    )
  }
}

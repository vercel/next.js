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

import path from 'path'
import { prepend, remove } from './file-protocol'

const ORPHAN_CR_REGEX = /\r(?!\n)(.|\n)?/g

export default function process(
  postcss: any,
  sourceFile: any,
  sourceContent: any,
  params: any
) {
  // #107 libsass emits orphan CR not considered newline, postcss does consider newline (content vs source-map mismatch)

  postcssPlugin.postcss = true

  // prepend file protocol to all sources to avoid problems with source map
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  return postcss([postcssPlugin])
    .process(sourceContent, {
      from: prepend(sourceFile),
      map: params.outputSourceMap && {
        prev: !!params.inputSourceMap && prepend(params.inputSourceMap),
        inline: false,
        annotation: false,
        sourcesContent: true, // #98 sourcesContent missing from output map
      },
    })
    .then((result: any) => ({
      content: result.css,
      map: params.outputSourceMap ? remove(result.map.toJSON()) : null,
    }))

  /**
   * Plugin for postcss that follows SASS transpilation.
   */
  function postcssPlugin() {
    return {
      postcssPlugin: 'postcss-resolve-url',
      Once: function (root: any) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        root.walkDecls(eachDeclaration)
      },
    }

    /**
     * Process a declaration from the syntax tree.
     * @param declaration
     */
    function eachDeclaration(declaration: any) {
      const isValid = declaration.value && declaration.value.indexOf('url') >= 0
      if (isValid) {
        // reverse the original source-map to find the original source file before transpilation
        const startPosApparent = declaration.source.start,
          startPosOriginal =
            params.sourceMapConsumer &&
            params.sourceMapConsumer.originalPositionFor(startPosApparent)

        // we require a valid directory for the specified file
        const directory =
          startPosOriginal &&
          startPosOriginal.source &&
          remove(path.dirname(startPosOriginal.source))
        if (directory) {
          declaration.value = params.transformDeclaration(
            declaration.value,
            directory
          )
        }
        // source-map present but invalid entry
        else if (params.sourceMapConsumer) {
          throw new Error(
            'source-map information is not available at url() declaration ' +
              (ORPHAN_CR_REGEX.test(sourceContent)
                ? '(found orphan CR, try removeCR option)'
                : '(no orphan CR found)')
          )
        }
      }
    }
  }
}

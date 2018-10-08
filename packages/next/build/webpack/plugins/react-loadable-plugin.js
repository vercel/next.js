/**
COPYRIGHT (c) 2017-present James Kyle <me@thejameskyle.com>
 MIT License
 Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:
 The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.
 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWAR
*/
// Implementation of this PR: https://github.com/jamiebuilds/react-loadable/pull/132
// Modified to strip out unneeded results for Next's specific use case

import url from 'url'
import path from 'path'
import {IS_BUNDLED_PAGE_REGEX} from 'next-server/constants'

export class ReactLoadablePlugin {
  apply (compiler) {
    compiler.hooks.emit.tapPromise('ReactLoadableManifest', async (compilation) => {
      const context = compiler.options.context
      const manifest = {}

      for (const chunk of compilation.chunks) {
        for (const file of chunk.files) {
          // If it doesn't end in `.js` Next.js can't handle it right now.
          if (!file.match(/\.js$/) || !file.match(/^static\/chunks\//)) {
            continue
          }

          for (const module of chunk.modulesIterable) {
            const id = module.id
            const name = typeof module.libIdent === 'function' ? module.libIdent({ context }) : null
            const publicPath = url.resolve(compilation.outputOptions.publicPath || '', file)

            let currentModule = module
            if (module.constructor.name === 'ConcatenatedModule') {
              currentModule = module.rootModule
            }
            if (!manifest[currentModule.rawRequest]) {
              manifest[currentModule.rawRequest] = []
            }

            manifest[currentModule.rawRequest].push({ id, name, file, publicPath })
          }
        }
      }

      const json = JSON.stringify(manifest)

      for (const [, entrypoint] of compilation.entrypoints.entries()) {
        if (!IS_BUNDLED_PAGE_REGEX.exec(entrypoint.name)) {
          continue
        }

        const manifestFile = path.join('server', entrypoint.name.replace(/\.js$/, '-loadable.json'))

        compilation.assets[manifestFile] = {
          source () {
            return json
          },
          size () {
            return json.length
          }
        }
      }
    })
  }
}

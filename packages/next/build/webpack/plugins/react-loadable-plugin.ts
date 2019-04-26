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
import { Compiler, compilation } from 'next/dist/compiled/webpack'

function buildManifest (compiler: Compiler, compilation: compilation.Compilation) {
  let context = compiler.options.context
  let manifest: { [k: string]: any[] } = {}

  compilation.chunkGroups.forEach(chunkGroup => {
    if (chunkGroup.isInitial()) {
      return
    }

    chunkGroup.origins.forEach((chunkGroupOrigin: any) => {
      const { request } = chunkGroupOrigin

      chunkGroup.chunks.forEach((chunk: any) => {
        chunk.files.forEach((file: string) => {
          if (!file.match(/\.js$/) || !file.match(/^static\/chunks\//)) {
            return
          }

          let publicPath = url.resolve(
            compilation.outputOptions.publicPath || '',
            file
          )

          for (const module of chunk.modulesIterable) {
            let id = module.id
            let name =
              typeof module.libIdent === 'function'
                ? module.libIdent({ context })
                : null

            if (!manifest[request]) {
              manifest[request] = []
            }

            // Avoid duplicate files
            if (manifest[request].some(item => item.file === file)) {
              continue
            }

            manifest[request].push({
              id,
              name,
              file,
              publicPath
            })
          }
        })
      })
    })
  })

  manifest = Object.keys(manifest)
    .sort()
    .reduce((a, c) => ((a[c] = manifest[c]), a), {} as any)

  return manifest
}

export class ReactLoadablePlugin {
  private filename: string

  constructor (opts: { filename: string }) {
    this.filename = opts.filename
  }

  apply (compiler: Compiler) {
    compiler.hooks.emit.tapAsync(
      'ReactLoadableManifest',
      (compilation, callback) => {
        const manifest = buildManifest(compiler, compilation)
        var json = JSON.stringify(manifest, null, 2)
        compilation.assets[this.filename] = {
          source () {
            return json
          },
          size () {
            return json.length
          }
        }
        callback()
      }
    )
  }
}

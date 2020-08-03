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

import webpack, {
  Compiler,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  compilation as CompilationType,
} from 'webpack'

const isWebpack5 = parseInt(webpack.version!) === 5

function getModulesIterable(compilation: any, chunk: any) {
  if (isWebpack5) {
    return compilation.chunkGraph.getChunkModulesIterable(chunk)
  }

  return chunk.modulesIterable
}

function getModuleId(compilation: any, module: any) {
  if (isWebpack5) {
    return compilation.chunkGraph.getModuleId(module)
  }

  return module.id
}

function buildManifest(
  _compiler: Compiler,
  compilation: CompilationType.Compilation
) {
  let manifest: { [k: string]: any[] } = {}

  compilation.chunkGroups.forEach((chunkGroup) => {
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

          for (const module of getModulesIterable(compilation, chunk)) {
            let id = getModuleId(compilation, module)

            if (!manifest[request]) {
              manifest[request] = []
            }

            // Avoid duplicate files
            if (
              manifest[request].some(
                (item) => item.id === id && item.file === file
              )
            ) {
              continue
            }

            manifest[request].push({
              id,
              file,
            })
          }
        })
      })
    })
  })

  manifest = Object.keys(manifest)
    .sort()
    // eslint-disable-next-line no-sequences
    .reduce((a, c) => ((a[c] = manifest[c]), a), {} as any)

  return manifest
}

export class ReactLoadablePlugin {
  private filename: string

  constructor(opts: { filename: string }) {
    this.filename = opts.filename
  }

  createAssets(compiler: any, compilation: any, assets: any) {
    const manifest = buildManifest(compiler, compilation)
    var json = JSON.stringify(manifest, null, 2)
    assets[this.filename] = {
      source() {
        return json
      },
      size() {
        return json.length
      },
    }
    return assets
  }

  apply(compiler: Compiler) {
    if (isWebpack5) {
      compiler.hooks.make.tap('ReactLoadableManifest', (compilation) => {
        // @ts-ignore TODO: Remove ignore when webpack 5 is stable
        compilation.hooks.processAssets.tap(
          {
            name: 'ReactLoadableManifest',
            // @ts-ignore TODO: Remove ignore when webpack 5 is stable
            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
          },
          (assets: any) => {
            this.createAssets(compiler, compilation, assets)
          }
        )
      })
      return
    }

    compiler.hooks.emit.tap('ReactLoadableManifest', (compilation: any) => {
      this.createAssets(compiler, compilation, compilation.assets)
    })
  }
}

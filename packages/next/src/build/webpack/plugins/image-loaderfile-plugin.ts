import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { getBaseSWCOptions } from 'next/src/build/swc/options'
import { readFileSync, writeFileSync, copyFileSync } from 'fs'
import { dirname, join } from 'path'
import { transform } from '../../swc'
import type { NextConfigComplete } from '../../../server/config-shared'

export class ImageLoaderFilePlugin {
  opts: { dev: boolean; config: NextConfigComplete }

  constructor(opts: { dev: boolean; config: NextConfigComplete }) {
    console.log('ImageLoaderFilePlugin constructor')
    this.opts = opts
  }

  apply(compiler: webpack.Compiler) {
    console.log('ImageLoaderFilePlugin apply')
    compiler.hooks.beforeCompile.tapPromise(
      'ImageLoaderFilePlugin',
      async () => {
        console.log('ImageLoaderFilePlugin beforeCompile')
        const {
          dev,
          config: {
            images: { loaderFile },
          },
        } = this.opts
        const srcPath = require.resolve('next/dist/shared/lib/image-loader')
        const destPath = join(dirname(srcPath), 'image-loader-generated.js')
        if (loaderFile) {
          const source = readFileSync(loaderFile, 'utf8')

          const swcOpts = getBaseSWCOptions({
            filename: srcPath,
            development: dev,
            hasReactRefresh: false,
            globalWindow: false,
            swcPlugins: [],
            compilerOptions: {},
            jsConfig: {},
          })

          const result = await transform(source, swcOpts)

          console.log('result from swc is', result)

          writeFileSync(destPath, result.code)
        } else {
          copyFileSync(srcPath, destPath)
        }
      }
    )
  }
}

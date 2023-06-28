import { readFileSync, writeFileSync, copyFileSync } from 'fs'
import { dirname, join } from 'path'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { NextConfigComplete } from '../../../server/config-shared'
import { getBaseSWCOptions } from '../../swc/options'
import { transform } from '../../swc'

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
            filename: loaderFile,
            development: dev,
            hasReactRefresh: false,
            globalWindow: false,
            swcPlugins: [],
            compilerOptions: {},
            jsConfig: {},
          })

          console.log('swcOpts is', swcOpts)

          const result = await transform(source, {
            ...swcOpts,
            module: {
              type: 'commonjs',
            },
          })

          console.log('result from swc is', result)

          writeFileSync(destPath, result.code)
        } else {
          copyFileSync(srcPath, destPath)
        }
      }
    )
  }
}

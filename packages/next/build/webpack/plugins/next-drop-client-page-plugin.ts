import { Compiler, Plugin } from 'webpack'

// Prevents outputting client pages when they are not needed
export class DropClientPage implements Plugin {
  apply(compiler: Compiler) {
    compiler.hooks.emit.tap('DropClientPage', compilation => {
      Object.keys(compilation.assets).forEach(assetKey => {
        const asset = compilation.assets[assetKey]

        if (asset && asset._value && asset._value.includes('__NEXT_DROP_CLIENT_FILE__')) {
          delete compilation.assets[assetKey]
        }
      })
    })
  }
}

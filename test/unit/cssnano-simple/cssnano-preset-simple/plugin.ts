// https://github.com/Timer/cssnano-preset-simple/blob/master/test/plugin.js
import postcss from 'postcss'
import type { PluginCreator } from 'postcss'

// Since the cssnano-preset-simple.js will be bundled into cssnano-simple
// during pre-compilation, we need to test against the source file directly
import cssnanoPresetSimple from 'next/src/bundles/cssnano-simple/cssnano-preset-simple'

const cssnanoPlugin = (options = {}) => {
  const plugins: any[] = []
  const nanoPlugins = cssnanoPresetSimple(options).plugins
  for (const nanoPlugin of nanoPlugins) {
    if (Array.isArray(nanoPlugin)) {
      let [processor, opts] = nanoPlugin
      processor = processor.default || processor
      if (
        typeof opts === 'undefined' ||
        (typeof opts === 'object' && !opts.exclude) ||
        (typeof opts === 'boolean' && opts === true)
      ) {
        plugins.push(processor(opts))
      }
    } else {
      plugins.push(nanoPlugin)
    }
  }
  return postcss(plugins)
}

cssnanoPlugin.postcss = true
export default cssnanoPlugin as PluginCreator<any>

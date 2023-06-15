// Originated from https://github.com/Timer/cssnano-preset-simple/blob/master/postcss-plugin-stub/index.js

/**
 * This file creates a stub postcss plugin
 *
 * It will be pre-compiled into "src/compiled/postcss-plugin-stub-for-cssnano-simple",
 * which "postcss-svgo" will be aliased to when creating "cssnano-preset-simple"
 */

function pluginCreator() {
  return {
    postcssPlugin: 'postcss-plugin-stub',
    prepare() {
      return {}
    },
  }
}
pluginCreator.postcss = true

Object.defineProperty(exports, '__esModule', {
  value: true,
})

module.exports = pluginCreator
module.exports.default = pluginCreator

// Originated from https://github.com/Timer/cssnano-preset-simple/blob/master/src/index.js

/**
 * We will not try to override "postcss-svgo" here. Instead we will alias "postcss-svgo" to a stub
 * plugin (located at "next/dist/compiled/postcss-plugin-stub-for-cssnano-simple") during pre-compilation
 */

module.exports = function (opts = {}) {
  const options = Object.assign(
    {},
    { cssDeclarationSorter: { exclude: true }, calc: { exclude: true } },
    opts
  )
  // eslint-disable-next-line import/no-extraneous-dependencies
  return require('cssnano-preset-default')(options)
}

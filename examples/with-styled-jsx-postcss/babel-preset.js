const nextBabelPreset = require('next/babel')

nextBabelPreset.plugins = nextBabelPreset.plugins.map(plugin => {
  if (!Array.isArray(plugin) && plugin.indexOf('styled-jsx/babel') !== -1) {
    return require.resolve('styled-jsx-postcss/babel')
  }
  return plugin
})

module.exports = nextBabelPreset

// Resolve styled-jsx plugins
function styledJsxOptions (opts) {
  if (!opts) {
    return {}
  }

  if (!Array.isArray(opts.plugins)) {
    return opts
  }

  opts.plugins = opts.plugins.map(plugin => {
    if (Array.isArray(plugin)) {
      const [name, options] = plugin
      return [
        require.resolve(name),
        options
      ]
    }

    return require.resolve(plugin)
  })

  return opts
}

module.exports = (context, opts = {}) => ({
  presets: [
    [require('@babel/preset-env'), {
      modules: false,
      ...opts['preset-env']
    }],
    require('@babel/preset-react')
  ],
  plugins: [
    require('babel-plugin-react-require'),
    require('@babel/plugin-syntax-dynamic-import'),
    require('./plugins/react-loadable-plugin'),
    [require('@babel/plugin-proposal-class-properties'), opts['class-properties'] || {}],
    require('@babel/plugin-proposal-object-rest-spread'),
    [require('@babel/plugin-transform-runtime'), {
      helpers: false,
      regenerator: true,
      ...opts['transform-runtime']
    }],
    [require('styled-jsx/babel'), styledJsxOptions(opts['styled-jsx'])],
    process.env.NODE_ENV === 'production' && require('babel-plugin-transform-react-remove-prop-types')
  ].filter(Boolean)
})

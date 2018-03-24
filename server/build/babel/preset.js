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

const envPlugins = {
  'development': [
    require('@babel/plugin-transform-react-jsx-source')
  ],
  'production': [
    require('babel-plugin-transform-react-remove-prop-types')
  ]
}

const plugins = envPlugins[process.env.NODE_ENV] || envPlugins['development']

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
    require('./plugins/handle-import'),
    require('@babel/plugin-proposal-class-properties'),
    require('@babel/plugin-proposal-object-rest-spread'),
    [require('@babel/plugin-transform-runtime'), opts['transform-runtime'] || {
      helpers: false,
      polyfill: false,
      regenerator: true
    }],
    [require('styled-jsx/babel'), styledJsxOptions(opts['styled-jsx'])],
    ...plugins
  ]
})

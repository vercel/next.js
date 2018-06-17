const envPlugins = {
  'development': [
    require.resolve('babel-plugin-transform-react-jsx-source')
  ],
  'production': [
    require.resolve('babel-plugin-transform-react-remove-prop-types')
  ]
}

const plugins = envPlugins[process.env.NODE_ENV] || envPlugins['development']

const isServer = !!process.env.IS_SERVER

module.exports = (context, opts = {}) => ({
  presets: [
    [require.resolve('babel-preset-env'), {
      modules: false,
      loose: true,
      targets: !isServer ? {
        browsers: ['ie >= 11', 'edge >= 16', 'safari >= 9', 'chrome >= 64', 'firefox >= 60']
      } : { node: 'current' },
      exclude: ['transform-es2015-typeof-symbol'],
      useBuiltIns: true
    }],
    require.resolve('babel-preset-react')
  ],
  plugins: [
    !isServer && require.resolve('react-hot-loader/babel'),
    require.resolve('babel-plugin-react-require'),
    require.resolve('./plugins/handle-import'),
    require.resolve('babel-plugin-transform-object-rest-spread'),
    require.resolve('babel-plugin-transform-class-properties'),

    [require.resolve('babel-plugin-transform-runtime'), {
      helpers: true,
      polyfill: false
    }],

    [require.resolve('babel-plugin-transform-define'), {
      'typeof window': isServer ? 'undefined' : 'object'
    }],

    ...plugins,
    isServer && require.resolve('babel-plugin-transform-es2015-modules-commonjs'),
    [
      require.resolve('babel-plugin-module-resolver'),
      {
        alias: {
          'next/client': isServer ? undefined : '@kpdecker/next/browser/client',
          'next/link': isServer ? '@kpdecker/next/node/lib/link' : '@kpdecker/next/browser/lib/link',
          'next/dynamic': isServer ? '@kpdecker/next/node/lib/dynamic' : '@kpdecker/next/browser/lib/dynamic',
          'next/head': isServer ? '@kpdecker/next/node/lib/head' : '@kpdecker/next/browser/lib/head',
          'next/document': isServer ? '@kpdecker/next/node/server/document' : undefined,
          'next/same-loop-promise': isServer ? '@kpdecker/next/node/lib/same-loop-promise' : '@kpdecker/next/browser/lib/same-loop-promise',
          'next/router': isServer ? '@kpdecker/next/node/lib/router' : '@kpdecker/next/browser/lib/router',
          'next/error': isServer ? '@kpdecker/next/node/lib/error' : '@kpdecker/next/browser/lib/error'
        }
      }
    ]
  ]
    .filter(Boolean)
})

const envPlugins = {
  'development': [
    require.resolve('@babel/plugin-transform-react-jsx-source')
  ],
  'production': [
    require.resolve('babel-plugin-transform-react-remove-prop-types')
  ]
}

const plugins = envPlugins[process.env.NODE_ENV] || envPlugins['development']

const isJest = !!process.env.JEST_WORKER_ID
const isServer = !!process.env.IS_SERVER || isJest

export default (context, opts = {}) => ({
  presets: [
    [require.resolve('@babel/preset-env'), {
      modules: false,
      loose: true,
      targets: !isServer ? {
        browsers: ['ie >= 11', 'edge >= 16', 'safari >= 9', 'chrome >= 64', 'firefox >= 60']
      } : { node: 'current' },
      exclude: ['@babel/plugin-transform-typeof-symbol'],
      useBuiltIns: false
    }],
    require.resolve('@babel/preset-react')
  ],
  plugins: [
    !isServer && require.resolve('react-hot-loader/babel'),
    require.resolve('babel-plugin-react-require'),
    require.resolve('./plugins/handle-import'),
    require.resolve('@babel/plugin-proposal-object-rest-spread'),
    require.resolve('@babel/plugin-proposal-class-properties'),

    [require.resolve('@babel/plugin-transform-runtime'), {
      helpers: true
    }],

    [require.resolve('babel-plugin-transform-define'), {
      'typeof window': isServer && !isJest ? 'undefined' : 'object'
    }],

    ...plugins,
    isServer && require.resolve('@babel/plugin-transform-modules-commonjs'),
    [
      require.resolve('babel-plugin-module-resolver'),
      {
        alias: {
          'next/client': isServer ? undefined : '@kpdecker/next/browser/client',
          'next/link': isServer ? '@kpdecker/next/node/lib/link' : '@kpdecker/next/browser/lib/link',
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

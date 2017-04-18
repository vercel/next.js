const relativeResolve = require('../root-module-relative-path').default(require)

const envPlugins = {
  'development': [
    require.resolve('babel-plugin-transform-react-jsx-source')
  ],
  'production': [
    require.resolve('babel-plugin-transform-react-remove-prop-types')
  ]
}

const plugins = envPlugins[process.env.NODE_ENV] || []

const es2015Config = {}

// Do not transform ES2015 modules if we are inside Next.js
// That's because webpack2 knows how to handle it.
// (And that's how it can do code splitting)
//
// But in other environements like Jest, we should transform it.
if (process.env.INSIDE_NEXT) {
  es2015Config.modules = false
}

module.exports = {
  presets: [
    [require.resolve('babel-preset-latest'), {
      'es2015': es2015Config
    }],
    require.resolve('babel-preset-react')
  ],
  plugins: [
    require.resolve('babel-plugin-react-require'),
    require.resolve('babel-plugin-transform-object-rest-spread'),
    require.resolve('babel-plugin-transform-class-properties'),
    require.resolve('babel-plugin-transform-runtime'),
    require.resolve('styled-jsx/babel'),
    ...plugins,
    [
      require.resolve('babel-plugin-module-resolver'),
      {
        alias: {
          'babel-runtime': relativeResolve('babel-runtime/package'),
          'next/link': relativeResolve('../../../lib/link'),
          'next/prefetch': relativeResolve('../../../lib/prefetch'),
          'next/css': relativeResolve('../../../lib/css'),
          'next/head': relativeResolve('../../../lib/head'),
          'next/document': relativeResolve('../../../server/document'),
          'next/router': relativeResolve('../../../lib/router'),
          'next/error': relativeResolve('../../../lib/error')
        }
      }
    ]
  ]
}

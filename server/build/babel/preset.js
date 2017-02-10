const isProduction = process.env.NODE_ENV === 'production'
const babelRuntimePath = require.resolve('babel-runtime/package')
  .replace(/[\\/]package\.json$/, '')

const productionPlugins = isProduction ? [
  require.resolve('babel-plugin-transform-react-constant-elements'),
  require.resolve('babel-plugin-transform-react-remove-prop-types'),
  require.resolve('babel-plugin-transform-react-pure-class-to-function')
] : []

module.exports = {
  presets: [
    [require.resolve('babel-preset-latest'), {
      'es2015': { modules: false }
    }],
    require.resolve('babel-preset-react')
  ],
  plugins: [
    require.resolve('babel-plugin-react-require'),
    require.resolve('babel-plugin-transform-object-rest-spread'),
    require.resolve('babel-plugin-transform-class-properties'),
    require.resolve('babel-plugin-transform-runtime'),
    require.resolve('styled-jsx/babel'),
    ...productionPlugins,
    [
      require.resolve('babel-plugin-module-resolver'),
      {
        alias: {
          'babel-runtime': babelRuntimePath,
          'next/link': require.resolve('../../../lib/link'),
          'next/prefetch': require.resolve('../../../lib/prefetch'),
          'next/css': require.resolve('../../../lib/css'),
          'next/head': require.resolve('../../../lib/head'),
          'next/document': require.resolve('../../../server/document'),
          'next/router': require.resolve('../../../lib/router'),
          'next/error': require.resolve('../../../lib/error')
        }
      }
    ]
  ]
}

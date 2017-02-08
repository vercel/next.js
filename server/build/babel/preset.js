const babelRuntimePath = require.resolve('babel-runtime/package')
  .replace(/[\\/]package\.json$/, '')

module.exports = {
  presets: [
    [require.resolve('babel-preset-es2015'), { modules: false }],
    require.resolve('babel-preset-react')
  ],
  plugins: [
    require.resolve('babel-plugin-react-require'),
    require.resolve('babel-plugin-transform-async-to-generator'),
    require.resolve('babel-plugin-transform-object-rest-spread'),
    require.resolve('babel-plugin-transform-class-properties'),
    require.resolve('babel-plugin-transform-runtime'),
    require.resolve('styled-jsx/babel'),
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
          'next/router': require.resolve('../../../lib/router')
        }
      }
    ]
  ]
}

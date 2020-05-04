const createPreset = require('@healthline/six-million/babel').default

const isJest = !!process.env.JEST_WORKER_ID
const isServer = !!process.env.IS_SERVER || isJest
exports.modernBrowsers = {
  ios: '11.3',
  chrome: '70',
  firefox: '60'
}

module.exports = (context, opts = {}) => {
  opts = {
    ...opts,
    modernBrowsers: require('./node/server/compile-targets').modernBrowsers
  }
  const preset = createPreset(context, opts)
  preset.plugins.push(
    [
      require.resolve('babel-plugin-module-resolver'),
      {
        alias: {
          'next/client': isServer ? undefined : '@healthline/next/browser/client',
          'next/link': isServer ? '@healthline/next/node/lib/link' : '@healthline/next/browser/lib/link',
          'next/head': isServer ? '@healthline/next/node/lib/head' : '@healthline/next/browser/lib/head',
          'next/page-loader': isServer ? '@healthline/next/node/lib/page-loader' : '@healthline/next/browser/lib/page-loader',
          'next/document': isServer ? '@healthline/next/node/server/document' : undefined,
          'next/router': isServer ? '@healthline/next/node/server/router' : '@healthline/next/browser/client/router'
        }
      }
    ])
  return preset
}

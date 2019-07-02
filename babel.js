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
          'next/client': isServer ? undefined : '@kpdecker/next/browser/client',
          'next/link': isServer ? '@kpdecker/next/node/lib/link' : '@kpdecker/next/browser/lib/link',
          'next/head': isServer ? '@kpdecker/next/node/lib/head' : '@kpdecker/next/browser/lib/head',
          'next/page-loader': isServer ? '@kpdecker/next/node/lib/page-loader' : '@kpdecker/next/browser/lib/page-loader',
          'next/document': isServer ? '@kpdecker/next/node/server/document' : undefined,
          'next/router': isServer ? '@kpdecker/next/node/server/router' : '@kpdecker/next/browser/client/router'
        }
      }
    ])
  return preset
}

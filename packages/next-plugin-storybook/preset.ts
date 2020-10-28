import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { findPagesDir } from 'next/lib/find-pages-dir'
import loadConfig from 'next/next-server/server/config'
import getWebpackConfig from 'next/build/webpack-config'

const CWD = process.cwd()

async function webpackFinal(config) {
  const pagesDir = findPagesDir(CWD)
  const nextConfig = await loadConfig(PHASE_PRODUCTION_BUILD, CWD)
  const nextWebpackConfig = await getWebpackConfig(CWD, {
    pagesDir,
    entrypoints: {},
    isServer: false,
    target: 'server',
    config: nextConfig,
    buildId: 'storybook',
    rewrites: [],
  })

  config.plugins = [...config.plugins, ...nextWebpackConfig.plugins]

  config.resolve = {
    ...config.resolve,
    ...nextWebpackConfig.resolve,
  }

  config.module.rules = [
    ...config.module.rules.filter((rule) => {
      // the rules we're filtering use RegExp for the test
      if (!(rule.test instanceof RegExp)) return true
      // use Next.js' built-in CSS
      if (rule.test.test('hello.css')) {
        return false
      }
      // use next-babel-loader instead of storybook's babel-loader
      if (
        rule.test.test('hello.js') &&
        Array.isArray(rule.use) &&
        rule.use[0].loader === 'babel-loader'
      ) {
        return false
      }
      return true
    }),
    ...nextWebpackConfig.module.rules.map((rule) => {
      // we need to resolve next-babel-loader since it's not available
      // relative with storybook's config
      if (rule.use && rule.use.loader === 'next-babel-loader') {
        rule.use.loader = require.resolve(
          'next/dist/build/webpack/loaders/next-babel-loader'
        )
      }
      return rule
    }),
  ]

  return config
}

module.exports = {
  webpackFinal,
}

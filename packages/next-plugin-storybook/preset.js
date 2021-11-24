const { PHASE_PRODUCTION_BUILD } = require('next/constants')
const { findPagesDir } = require('next/dist/lib/find-pages-dir')
const loadConfig = require('next/dist/next-server/server/config').default
const getWebpackConfig = require('next/dist/build/webpack-config').default

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
    rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
  })

  config.plugins = [...config.plugins, ...nextWebpackConfig.plugins]

  config.resolve = {
    ...config.resolve,
    ...nextWebpackConfig.resolve,
  }

  config.module.rules = [
    ...filterModuleRules(config),
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

function filterModuleRules(config) {
  return config.module.rules.filter((rule) => {
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
  })
}

module.exports = {
  webpackFinal,
  filterModuleRules,
}

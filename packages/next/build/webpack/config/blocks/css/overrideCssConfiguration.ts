import { webpack } from 'next/dist/compiled/webpack/webpack'
import { getPostCssPlugins } from './plugins'
import postcss from 'postcss'

export async function __overrideCssConfiguration(
  rootDirectory: string,
  supportedBrowsers: string[] | undefined,
  config: webpack.Configuration
) {
  const postCssPlugins = await getPostCssPlugins(
    rootDirectory,
    supportedBrowsers
  )

  function patch(rule: webpack.RuleSetRule) {
    if (
      rule.options &&
      typeof rule.options === 'object' &&
      typeof rule.options.postcssOptions === 'object'
    ) {
      rule.options.postcssOptions.plugins = postCssPlugins
    } else if (
      rule.options &&
      typeof rule.options === 'object' &&
      typeof rule.options.postcss !== 'undefined'
    ) {
      rule.options.postcss = postcss(postCssPlugins)
    } else if (Array.isArray(rule.oneOf)) {
      rule.oneOf.forEach(patch)
    } else if (Array.isArray(rule.use)) {
      rule.use.forEach((u) => {
        if (typeof u === 'object') {
          patch(u)
        }
      })
    }
  }

  config.module?.rules?.forEach((entry) => {
    patch(entry)
  })
}

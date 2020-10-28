import { Configuration, RuleSetRule } from 'webpack'
import { getPostCssPlugins } from './plugins'

export async function __overrideCssConfiguration(
  rootDirectory: string,
  isProduction: boolean,
  config: Configuration
) {
  const postCssPlugins = await getPostCssPlugins(rootDirectory, isProduction)

  function patch(rule: RuleSetRule) {
    if (
      rule.options &&
      typeof rule.options === 'object' &&
      typeof rule.options.postcssOptions === 'object'
    ) {
      rule.options.postcssOptions.plugins = postCssPlugins
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

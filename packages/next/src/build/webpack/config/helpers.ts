import curry from 'next/dist/compiled/lodash.curry'
import type { webpack } from 'next/dist/compiled/webpack/webpack'

export const loader = curry(function loader(
  rule: webpack.RuleSetRule,
  config: webpack.Configuration
) {
  if (!config.module) {
    config.module = { rules: [] }
  }

  if (rule.oneOf) {
    const existing = config.module.rules?.find(
      (arrayRule) =>
        arrayRule && typeof arrayRule === 'object' && arrayRule.oneOf
    )
    if (existing && typeof existing === 'object') {
      existing.oneOf!.push(...rule.oneOf)
      return config
    }
  }

  config.module.rules?.push(rule)
  return config
})

export const unshiftLoader = curry(function unshiftLoader(
  rule: webpack.RuleSetRule,
  config: webpack.Configuration
) {
  if (!config.module) {
    config.module = { rules: [] }
  }

  if (rule.oneOf) {
    const existing = config.module.rules?.find(
      (arrayRule) =>
        arrayRule && typeof arrayRule === 'object' && arrayRule.oneOf
    )
    if (existing && typeof existing === 'object') {
      existing.oneOf?.unshift(...rule.oneOf)
      return config
    }
  }

  config.module.rules?.unshift(rule)
  return config
})

export const plugin = curry(function plugin(
  p: webpack.WebpackPluginInstance,
  config: webpack.Configuration
) {
  if (!config.plugins) {
    config.plugins = []
  }
  config.plugins.push(p)
  return config
})

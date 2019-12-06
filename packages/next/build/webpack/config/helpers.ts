import curry from 'lodash.curry'
import { Configuration, RuleSetRule } from 'webpack'

export const loader = curry(function loader(
  rule: RuleSetRule,
  config: Configuration
) {
  if (!config.module) {
    config.module = { rules: [] }
  }

  if (rule.oneOf) {
    const existing = config.module.rules.find(rule => rule.oneOf)
    if (existing) {
      existing.oneOf!.push(...rule.oneOf)
      return config
    }
  }

  config.module.rules.push(rule)
  return config
})

export const unshiftLoader = curry(function loader(
  rule: RuleSetRule,
  config: Configuration
) {
  if (!config.module) {
    config.module = { rules: [] }
  }

  if (rule.oneOf) {
    const existing = config.module.rules.find(rule => rule.oneOf)
    if (existing) {
      existing.oneOf!.unshift(...rule.oneOf)
      return config
    }
  }

  config.module.rules.unshift(rule)
  return config
})

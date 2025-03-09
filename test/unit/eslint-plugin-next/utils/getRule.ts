import { rules } from '@next/eslint-plugin-next'
import { Rule } from 'eslint'

export const getRule = (ruleName: string): Rule.RuleModule => {
  const rule = rules?.[`@next/next/${ruleName}`]

  if (!rule) {
    throw new Error(`Rule @next/next/${ruleName} not found`)
  }

  return rule
}

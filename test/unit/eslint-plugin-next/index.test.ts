import { basename } from 'path'
import glob from 'glob'
import index from '@next/eslint-plugin-next'

const getRuleNameFromRulePath = (path) => basename(path, '.js')
const rulePaths = glob.sync('packages/eslint-plugin-next/lib/rules/*js', {
  absolute: true,
})

describe('@next/eslint-plugin-next index', () => {
  it('should include all defined rules and no extra / undefined rules', () => {
    const rules = rulePaths.map((rulePath) => getRuleNameFromRulePath(rulePath))

    expect(index.rules).toContainAllKeys(rules)
  })

  rulePaths.forEach((rulePath) => {
    const rule = require(rulePath)
    const ruleName = getRuleNameFromRulePath(rulePath)
    const { recommended } = rule.meta.docs

    it(`${ruleName}: recommend should be \`${recommended}\``, () => {
      expect(
        Object.hasOwn(index.configs.recommended.rules, `@next/next/${ruleName}`)
      ).toBe(recommended)
    })
  })
})

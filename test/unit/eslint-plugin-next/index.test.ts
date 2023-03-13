import { basename } from 'path'
import glob from 'glob'
import index from '@next/eslint-plugin-next'

const getRuleNameFromRulePath = (path) => basename(path, '.js')
const rulePaths = glob.sync('packages/eslint-plugin-next/dist/rules/*js', {
  absolute: true,
})

describe('@next/eslint-plugin-next index', () => {
  it('should include all defined rules and no extra / undefined rules', () => {
    const rules = rulePaths.map((rulePath) => getRuleNameFromRulePath(rulePath))

    expect(index.rules).toContainAllKeys(rules)
  })

  rulePaths.forEach((rulePath) => {
    let rule = require(rulePath)
    rule = rule.default ?? rule
    const ruleName = getRuleNameFromRulePath(rulePath)
    const { recommended = false } = rule.meta.docs

    it(`${ruleName}: recommend should be \`${recommended}\``, () => {
      expect(`@next/next/${ruleName}` in index.configs.recommended.rules).toBe(
        recommended
      )
    })
  })
})

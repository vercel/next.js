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

  it('should have meta information', () => {
    expect(index.meta).toBeDefined()
    expect(index.meta.name).toBe('@next/eslint-plugin-next')
  })

  it('should have proper flat config structure for recommended', () => {
    const config = index.configs.recommended
    expect(config.name).toBe('next/recommended')
    expect(config.rules).toBeDefined()
  })

  it('should have proper flat config structure for core-web-vitals', () => {
    const config = index.configs['core-web-vitals']
    expect(config.name).toBe('next/core-web-vitals')
    expect(config.rules).toBeDefined()
  })

  it('should have legacy recommended config', () => {
    const config = index.configs['recommended-legacy']
    expect(config.plugins).toContain('@next/next')
    expect(config.rules).toBeDefined()
  })

  it('should have legacy core-web-vitals config', () => {
    const config = index.configs['core-web-vitals-legacy']
    expect(config.plugins).toContain('@next/next')
    expect(config.extends).toContain('plugin:@next/next/recommended-legacy')
    expect(config.rules).toBeDefined()
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

import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-location-assign-relative-destination']

const err = (expression: string) => ({
  messageId: 'noLocationAssign',
  data: { expression },
})

describe('no-location-assign-relative-destination', () => {
  new RuleTester({
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          modules: true,
          jsx: true,
        },
      },
    },
  }).run('eslint', NextESLintRule, {
    valid: [
      // Reading href is fine
      `const href = location.href`,
      `const url = window.location.href`,
      // location.replace is not covered by this rule
      `location.replace('/foo')`,
      `window.location.replace('/foo')`,
      // Absolute URLs (with protocol) are allowed
      `location.href = 'https://example.com'`,
      `window.location.href = 'https://example.com/path'`,
      `globalThis.location.href = 'http://example.com'`,
      `location.assign('https://example.com')`,
      `window.location.assign('https://example.com/path')`,
      `globalThis.location.assign('http://example.com')`,
      // Bracket notation with absolute URL
      `location['href'] = 'https://example.com'`,
      `location['assign']('https://example.com')`,
    ],
    invalid: [
      // location.href = (relative)
      { code: `location.href = '/foo'`, errors: [err('location.href')] },
      // window.location.href = (relative)
      {
        code: `window.location.href = '/foo'`,
        errors: [err('window.location.href')],
      },
      // globalThis.location.href = (relative)
      {
        code: `globalThis.location.href = '/foo'`,
        errors: [err('globalThis.location.href')],
      },
      // location['href'] = (relative, bracket notation)
      {
        code: `location['href'] = '/foo'`,
        errors: [err("location['href']")],
      },
      // window.location['href'] = (relative, bracket notation)
      {
        code: `window.location['href'] = '/foo'`,
        errors: [err("window.location['href']")],
      },
      // location.href = (dynamic, unknown whether absolute)
      { code: `location.href = someVariable`, errors: [err('location.href')] },
      // location.assign() (relative)
      { code: `location.assign('/foo')`, errors: [err('location.assign()')] },
      // window.location.assign() (relative)
      {
        code: `window.location.assign('/foo')`,
        errors: [err('window.location.assign()')],
      },
      // globalThis.location.assign() (relative)
      {
        code: `globalThis.location.assign('/foo')`,
        errors: [err('globalThis.location.assign()')],
      },
      // location['assign']() (relative, bracket notation)
      {
        code: `location['assign']('/foo')`,
        errors: [err("location['assign']()")],
      },
      // window.location['assign']() (relative, bracket notation)
      {
        code: `window.location['assign']('/foo')`,
        errors: [err("window.location['assign']()")],
      },
      // location.assign() (dynamic, unknown whether absolute)
      {
        code: `location.assign(someVariable)`,
        errors: [err('location.assign()')],
      },
      // Inside a function
      {
        code: `
          function handleClick() {
            window.location.href = '/dashboard'
          }
        `,
        errors: [err('window.location.href')],
      },
      {
        code: `
          function handleClick() {
            location.assign('/dashboard')
          }
        `,
        errors: [err('location.assign()')],
      },
    ],
  })
})

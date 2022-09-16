const rule = require('./no-typeof-window')
// this is a dev file
// eslint-disable-next-line import/no-extraneous-dependencies
const { RuleTester } = require('eslint')

const ruleTester = new RuleTester()

const errors = [{ messageId: 'noTypeofWindow' }]

ruleTester.run('no-typeof-window', rule, {
  valid: [
    {
      code: 'process.env.browser',
    },
    {
      code: '!process.env.browser',
    },
  ],
  invalid: [
    {
      code: 'typeof window !== "undefined"',
      errors,
      output: 'process.env.browser',
    },
    {
      code: 'typeof window === "undefined"',
      errors,
      output: '!process.env.browser',
    },
    {
      code: '"undefined" !== typeof window',
      errors,
      output: 'process.env.browser',
    },
    {
      code: '"undefined" === typeof window',
      errors,
      output: '!process.env.browser',
    },
    {
      code: 'typeof window != "undefined"',
      errors,
      output: 'process.env.browser',
    },
    {
      code: 'typeof window == "undefined"',
      errors,
      output: '!process.env.browser',
    },
    {
      code: '"undefined" != typeof window',
      errors,
      output: 'process.env.browser',
    },
    {
      code: '"undefined" == typeof window',
      errors,
      output: '!process.env.browser',
    },
  ],
})

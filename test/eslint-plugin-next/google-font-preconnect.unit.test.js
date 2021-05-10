const rule = require('@next/eslint-plugin-next/lib/rules/google-font-preconnect')
const RuleTester = require('eslint').RuleTester

RuleTester.setDefaultConfig({
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      modules: true,
      jsx: true,
    },
  },
})

var ruleTester = new RuleTester()
ruleTester.run('google-font-preconnect', rule, {
  valid: [
    `export const Test = () => (
        <div>
          <link rel="preconnect" href="https://fonts.gstatic.com"/>
        </div>
      )
    `,
  ],

  invalid: [
    {
      code: `
      export const Test = () => (
        <div>
          <link href="https://fonts.gstatic.com"/>
        </div>
      )
    `,
      errors: [
        {
          message:
            'Preconnect is missing. See https://nextjs.org/docs/messages/google-font-preconnect.',
          type: 'JSXOpeningElement',
        },
      ],
    },
    {
      code: `
      export const Test = () => (
        <div>
          <link rel="preload" href="https://fonts.gstatic.com"/>
        </div>
      )
    `,
      errors: [
        {
          message:
            'Preconnect is missing. See https://nextjs.org/docs/messages/google-font-preconnect.',
          type: 'JSXOpeningElement',
        },
      ],
    },
  ],
})

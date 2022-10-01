import rule from '@next/eslint-plugin-next/dist/rules/google-font-preconnect'
import { RuleTester } from 'eslint'
;(RuleTester as any).setDefaultConfig({
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      modules: true,
      jsx: true,
    },
  },
})
const ruleTester = new RuleTester()

ruleTester.run('google-font-preconnect', rule, {
  valid: [
    `export const Test = () => (
        <div>
          <link rel="preconnect" href="https://fonts.gstatic.com"/>
          <link
            href={process.env.NEXT_PUBLIC_CANONICAL_URL}
            rel="canonical"
          />
          <link
            href={new URL("../public/favicon.ico", import.meta.url).toString()}
            rel="icon"
          />
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
            '`rel="preconnect"` is missing from Google Font. See: https://nextjs.org/docs/messages/google-font-preconnect',
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
            '`rel="preconnect"` is missing from Google Font. See: https://nextjs.org/docs/messages/google-font-preconnect',
          type: 'JSXOpeningElement',
        },
      ],
    },
  ],
})

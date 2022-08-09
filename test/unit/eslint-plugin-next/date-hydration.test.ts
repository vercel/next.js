import rule from '@next/eslint-plugin-next/lib/rules/date-hydration'
import { RuleTester } from 'eslint'

new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: { modules: true, jsx: true },
  },
}).run('date-hydration', rule, {
  valid: [
    `export default function Page() {
    return <p suppressHydrationWarning={true}>{new Date().toLocaleString()}</p>
  }`,
    `export default function Page() {
    return <p >{format(new Date())}</p>
  }`,
  ],
  invalid: [
    {
      code: `export default function Page() {
        return <p>{new Date().toLocaleString()}</p>
      }`,
      filename: 'pages/index.js',
      errors: [
        {
          message:
            'Rendering `Date` directly can cause a hydration mismatch. See https://nextjs.org/docs/messages/date-hydration',
          type: 'JSXExpressionContainer',
        },
      ],
    },
  ],
})

import rule from '@next/eslint-plugin-next/dist/rules/date-hydration'
import { ruleTester } from './utils'

const invalidCommon = {
  filename: 'pages/index.tsx',
  errors: [
    {
      message:
        'Rendering `Date` directly can cause a hydration mismatch. See https://nextjs.org/docs/messages/date-hydration',
      type: 'JSXExpressionContainer',
    },
  ],
}

ruleTester.run('date-hydration', rule, {
  valid: [
    `export default () => <p suppressHydrationWarning={true}>{new Date().toLocaleString()}</p>`,
    `export default () => <p suppressHydrationWarning>{new Date().toLocaleString()}</p>`,
    `export default () => <p>{format(new Date())}</p>`,
    `export default () => <p>{new Date().toISOString()}</p>`,
    `export default () => <p>{new Date().toUTCString()}</p>`,
  ],
  invalid: [
    {
      code: `export default () => <p>{new Date().toLocaleString()}</p>`,
      ...invalidCommon,
    },
    {
      code: `export default () => <p>{new Date().getTime()}</p>`,
      ...invalidCommon,
    },
    {
      code: `export default () =>
        <p suppressHydrationWarning={false}>{new Date().toLocaleString()}</p>`,
      ...invalidCommon,
    },
  ],
})

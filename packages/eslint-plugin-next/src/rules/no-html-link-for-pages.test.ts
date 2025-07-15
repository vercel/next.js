import rule from "./no-html-link-for-pages"
import { RuleTester } from 'eslint'

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
})

ruleTester.run('no-html-link-for-pages', rule, {
  valid: [
    {
      code: `<Link href="/about" />`,
      filename: 'src/pages/about.page.tsx',
      settings: {
        next: {
          pageExtensions: ['page.tsx'],
        },
      },
    },
  ],
  invalid: [
    {
      code: `<a href="/about" />`,
      filename: 'src/pages/about.page.tsx',
      settings: {
        next: {
          pageExtensions: ['page.tsx'],
        },
      },
      errors: [
        {
          message:
            'Do not use an `<a>` element to navigate to `/about/`. Use `<Link />` from `next/link` instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages',
        },
      ],
    },
  ],
})

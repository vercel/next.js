import rule from '@next/eslint-plugin-next/lib/rules/link-passhref'
import { RuleTester } from 'eslint'
;(RuleTester as any).setDefaultConfig({
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      modules: true,
      jsx: true,
    },
  },
})
const ruleTester = new RuleTester()

ruleTester.run('link-passhref', rule, {
  valid: [
    `export const Home = () => (
      <Link href="/test"></Link>
    )`,

    `export const Home = () => (
      <Link href="/test">
        <a>Test</a>
      </Link>
    )`,

    `export const Home = () => (
      <Link href="/test" passHref>
        <StyledLink>Test</StyledLink>
      </Link>
    )`,

    `const Link = () => <div>Fake Link</div>

     const Home = () => (
      <Link href="/test">
        <MyButton />
      </Link>
     )`,
  ],

  invalid: [
    {
      code: `
      import Link from 'next/link'

      export const Home = () => (
        <Link href="/test">
          <StyledLink>Test</StyledLink>
        </Link>
      )`,
      errors: [
        {
          message:
            'passHref is missing. See https://nextjs.org/docs/messages/link-passhref',
          type: 'JSXOpeningElement',
        },
      ],
    },
    {
      code: `
      import Link from 'next/link'

      export const Home = () => (
        <Link href="/test" passHref={false}>
          <StyledLink>Test</StyledLink>
        </Link>
      )`,
      errors: [
        {
          message:
            'passHref must be set to true. See https://nextjs.org/docs/messages/link-passhref',
          type: 'JSXOpeningElement',
        },
      ],
    },
  ],
})

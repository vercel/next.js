import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-invalid-head-elements']

const htmlMessage =
  'Do not use `<html>` element with `next/head`. Use `pages/_document` instead. See: https://nextjs.org/docs/messages/no-invalid-head-elements'

const bodyMessage =
  'Do not use `<body>` element with `next/head`. Use `pages/_document` instead. See: https://nextjs.org/docs/messages/no-invalid-head-elements'

const nestedHeadMessage =
  'Do not nest `<Head />` components inside `next/head`. See: https://nextjs.org/docs/messages/no-invalid-head-elements'

const tests = {
  valid: [
    {
      code: `import Head from 'next/head'

      export default function Page() {
        return (
          <Head>
            <title>Hello</title>
            <meta name="description" content="demo" />
          </Head>
        )
      }`,
      filename: 'pages/index.js',
    },
    {
      code: `import Head from 'next/head'

      export default function Page() {
        return (
          <Head>
            <>
              <title>Hello</title>
              <meta name="description" content="demo" />
            </>
          </Head>
        )
      }`,
      filename: 'pages/index.js',
    },
    {
      code: `import { Head } from 'next/document'

      export default function DocumentHead() {
        return (
          <Head>
            <html lang="en" />
          </Head>
        )
      }`,
      filename: 'pages/_document.js',
    },
  ],
  invalid: [
    {
      code: `import Head from 'next/head'

      export default function Page() {
        return (
          <Head>
            <html lang="en" />
          </Head>
        )
      }`,
      filename: 'pages/index.js',
      errors: [{ message: htmlMessage }],
    },
    {
      code: `import Head from 'next/head'

      export default function Page() {
        return (
          <Head>
            <body />
          </Head>
        )
      }`,
      filename: 'pages/index.js',
      errors: [{ message: bodyMessage }],
    },
    {
      code: `import Head from 'next/head'

      export default function Page() {
        return (
          <Head>
            <Head>
              <title>Hello</title>
            </Head>
          </Head>
        )
      }`,
      filename: 'pages/index.js',
      errors: [{ message: nestedHeadMessage }],
    },
    {
      code: `import Head from 'next/head'

      export default function Page() {
        return (
          <Head>
            <>
              <html lang="en" />
              <body />
            </>
          </Head>
        )
      }`,
      filename: 'pages/index.js',
      errors: [{ message: htmlMessage }, { message: bodyMessage }],
    },
  ],
}

describe('no-invalid-head-elements', () => {
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
  }).run('eslint', NextESLintRule, tests)
})

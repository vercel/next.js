import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-invalid-head-children']

const url = 'https://nextjs.org/docs/messages/no-invalid-head-children'
const allowed = '<title>, <meta>, <link>, <style>, <script>, <base>, <noscript>'
const messageFor = (tag: string) =>
  `Do not use <${tag}> in \`next/head\` component. Only ${allowed} are allowed. See: ${url}`

const tests = {
  valid: [
    // All allowed head children.
    `
      import Head from "next/head";

      export default function Index() {
        return (
          <Head>
            <title>Demo Page</title>
            <meta name="description" content="Demo" />
            <link rel="stylesheet" href="/style.css" />
            <style>{'body { color: red; }'}</style>
            <script src="/my-script.js" />
            <base href="/" />
            <noscript>JavaScript is required</noscript>
          </Head>
        );
      }`,
    // Custom components may render valid head elements.
    `
      import Head from "next/head";

      export default function Index() {
        return (
          <Head>
            <MyMeta />
          </Head>
        );
      }`,
    // Aliased next/head import is tracked.
    `
      import MyHead from "next/head";

      export default function Index() {
        return (
          <MyHead>
            <title>Demo Page</title>
          </MyHead>
        );
      }`,
    // A locally-defined Head with no next/head import is not checked.
    `
      const Head = ({children}) => children

      export default function Index() {
        return (
          <Head>
            <div>Not a real head</div>
          </Head>
        );
      }`,
    // Text and expressions inside Head are ignored.
    `
      import Head from "next/head";

      export default function Index() {
        const title = "Demo Page";
        return (
          <Head>
            {title}
            <title>{title}</title>
          </Head>
        );
      }`,
  ],

  invalid: [
    // The exact example from the issue.
    {
      code: `
      import Head from "next/head";

      export default function Index() {
        return (
          <Head>
            <html lang="en" />
            <title>Demo Page</title>
          </Head>
        );
      }`,
      filename: 'pages/index.js',
      errors: [{ message: messageFor('html') }],
    },
    {
      code: `
      import Head from "next/head";

      export default function Index() {
        return (
          <Head>
            <div>Invalid</div>
          </Head>
        );
      }`,
      filename: 'pages/index.js',
      errors: [{ message: messageFor('div') }],
    },
    {
      code: `
      import Head from "next/head";

      export default function Index() {
        return (
          <Head>
            <body>Invalid</body>
          </Head>
        );
      }`,
      filename: 'pages/index.js',
      errors: [{ message: messageFor('body') }],
    },
    {
      code: `
      import Head from "next/head";

      export default function Index() {
        return (
          <Head>
            <a href="/">Invalid</a>
            <span>Invalid</span>
          </Head>
        );
      }`,
      filename: 'pages/index.js',
      errors: [{ message: messageFor('a') }, { message: messageFor('span') }],
    },
  ],
}

describe('no-invalid-head-children', () => {
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

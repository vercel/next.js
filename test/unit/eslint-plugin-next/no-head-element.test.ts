import { RuleTester as ESLintTesterV8 } from 'eslint-v8'
import { RuleTester as ESLintTesterV9 } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-head-element']

const message =
  'Do not use `<head>` element. Use `<Head />` from `next/head` instead. See: https://nextjs.org/docs/messages/no-head-element'

const tests = {
  valid: [
    {
      code: `import Head from 'next/head';

      export class MyComponent {
        render() {
          return (
            <div>
              <Head>
                <title>My page title</title>
              </Head>
            </div>
          );
        }
      }
    `,
      filename: 'pages/index.js',
    },
    {
      code: `import Head from 'next/head';

      export class MyComponent {
        render() {
          return (
            <div>
              <Head>
                <title>My page title</title>
              </Head>
            </div>
          );
        }
      }
    `,
      filename: 'pages/index.tsx',
    },
    {
      code: `
      export default function Layout({ children }) {
        return (
          <html>
            <head>
              <title>layout</title>
            </head>
            <body>{children}</body>
          </html>
        );
      }
    `,
      filename: './app/layout.js',
    },
  ],
  invalid: [
    {
      code: `
      export class MyComponent {
        render() {
          return (
            <div>
              <head>
                <title>My page title</title>
              </head>
            </div>
          );
        }
      }`,
      filename: './pages/index.js',
      errors: [
        {
          message,
          type: 'JSXOpeningElement',
        },
      ],
    },
    {
      code: `import Head from 'next/head';

      export class MyComponent {
        render() {
          return (
            <div>
              <head>
                <title>My page title</title>
              </head>
              <Head>
                <title>My page title</title>
              </Head>
            </div>
          );
        }
      }`,
      filename: 'pages/index.ts',
      errors: [
        {
          message,
          type: 'JSXOpeningElement',
        },
      ],
    },
  ],
}

describe('no-head-element', () => {
  new ESLintTesterV8({
    parserOptions: {
      ecmaVersion: 2018,
      sourceType: 'module',
      ecmaFeatures: {
        modules: true,
        jsx: true,
      },
    },
  }).run('eslint-v8', NextESLintRule, tests)

  new ESLintTesterV9({
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
  }).run('eslint-v9', NextESLintRule, tests)
})

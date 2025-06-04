import { RuleTester as ESLintTesterV8 } from 'eslint-v8'
import { RuleTester as ESLintTesterV9 } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-title-in-document-head']

const tests = {
  valid: [
    `import Head from "next/head";

     class Test {
      render() {
        return (
          <Head>
            <title>My page title</title>
          </Head>
        );
      }
     }`,

    `import Document, { Html, Head } from "next/document";

     class MyDocument extends Document {
      render() {
        return (
          <Html>
            <Head>
            </Head>
          </Html>
        );
      }
     }

     export default MyDocument;
     `,
  ],

  invalid: [
    {
      code: `
      import { Head } from "next/document";

      class Test {
        render() {
          return (
            <Head>
              <title>My page title</title>
            </Head>
          );
        }
      }`,
      errors: [
        {
          message:
            'Do not use `<title>` element with `<Head />` component from `next/document`. Titles should defined at the page-level using `<Head />` from `next/head` instead. See: https://nextjs.org/docs/messages/no-title-in-document-head',
          type: 'JSXElement',
        },
      ],
    },
  ],
}

describe('no-title-in-document-head', () => {
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

import { RuleTester as ESLintTesterV8 } from 'eslint-v8'
import { RuleTester as ESLintTesterV9 } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-script-component-in-head']

const message =
  '`next/script` should not be used in `next/head` component. Move `<Script />` outside of `<Head>` instead. See: https://nextjs.org/docs/messages/no-script-component-in-head'

const tests = {
  valid: [
    `import Script from "next/script";
     const Head = ({children}) => children

    export default function Index() {
      return (
        <Head>
          <Script></Script>
        </Head>
      );
    }
    `,
  ],

  invalid: [
    {
      code: `
      import Head from "next/head";
      import Script from "next/script";

      export default function Index() {
        return (
            <Head>
              <Script></Script>
            </Head>
        );
      }`,
      filename: 'pages/index.js',
      errors: [{ message }],
    },
  ],
}

describe('no-script-component-in-head', () => {
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

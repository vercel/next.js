import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-script-component-in-head']

const message =
  '`next/script` should not be used in `next/head` component. Move `<Script />` outside of `<Head>` instead. See: https://nextjs.org/docs/messages/no-script-component-in-head'

const tests = {
  valid: [
    `import Head from 'next/head';
     import Script from 'another-library';
     export default () => <Head><Script /></Head>;`,
    `import NextHead from 'next/head';
     import Script from 'next/script';
     const Head = ({children}) => children;
     export default () => <Head><Script /></Head>;`,
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
    ...[
      ['Head', 'Script'],
      ['NextHead', 'NextScript'],
    ].map(([head, script]) => ({
      code: `
        import { default as ${head} } from 'next/head';
        import { default as ${script} } from 'next/script';
        export default () => <${head}><${script} /></${head}>;
      `,
      filename: 'pages/index.js',
      errors: [{ message }],
    })),
    {
      code: `
        import Head from 'next/head';
        import NextHead from 'next/head';
        import Script from 'next/script';
        import NextScript from 'next/script';
        export default () => <Head><Script /></Head>;
      `,
      filename: 'pages/index.js',
      errors: [{ message }],
    },
    ...[
      ['NextHead', 'Script'],
      ['Head', 'NextScript'],
      ['NextHead', 'NextScript'],
    ].map(([head, script]) => ({
      code: `
        import ${head} from 'next/head';
        import ${script} from 'next/script';
        export default () => <${head}><${script} src='/script.js' /></${head}>;
      `,
      filename: 'pages/index.js',
      errors: [{ message }],
    })),
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

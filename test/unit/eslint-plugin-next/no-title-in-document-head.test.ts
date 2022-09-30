import rule from '@next/eslint-plugin-next/dist/rules/no-title-in-document-head'
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

ruleTester.run('no-title-in-document-head', rule, {
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
})

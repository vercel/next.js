const rule = require('@next/eslint-plugin-next/lib/rules/no-title-in-document-head')
const RuleTester = require('eslint').RuleTester

RuleTester.setDefaultConfig({
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      modules: true,
      jsx: true,
    },
  },
})

var ruleTester = new RuleTester()
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
            'Titles should be defined at the page-level using next/head. See https://nextjs.org/docs/messages/no-title-in-document-head.',
          type: 'JSXElement',
        },
      ],
    },
  ],
})

const rule = require('@next/eslint-plugin-next/lib/rules/no-head-import-in-document')

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
ruleTester.run('no-head-import-in-document', rule, {
  valid: [
    {
      code: `import Document, { Html, Head, Main, NextScript } from 'next/document'

      class MyDocument extends Document {
        static async getInitialProps(ctx) {
          //...
        }
      
        render() {
          return (
            <Html>
              <Head>
              </Head>
            </Html>
          )
        }
      }
      
      export default MyDocument
    `,
      filename: 'pages/_document.tsx',
    },
    {
      code: `import Head from "next/head";

      export default function IndexPage() {
        return (
          <Head>
            <title>My page title</title>
            <meta name="viewport" content="initial-scale=1.0, width=device-width" />
          </Head>
        );
      }      
    `,
      filename: 'pages/index.tsx',
    },
  ],
  invalid: [
    {
      code: `
      import Document, { Html, Main, NextScript } from 'next/document'
      import Head from 'next/head'
      
      class MyDocument extends Document {
        render() {
          return (
            <Html>
              <Head />
              <body>
                <Main />
                <NextScript />
              </body>
            </Html>
          )
        }
      }
      
      export default MyDocument
      `,
      filename: 'pages/_document.js',
      errors: [
        {
          message:
            'next/head should not be imported in pages/_document.js. Import Head from next/document instead. See https://nextjs.org/docs/messages/no-head-import-in-document.',
          type: 'ImportDeclaration',
        },
      ],
    },
  ],
})

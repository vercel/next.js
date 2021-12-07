import rule from '@next/eslint-plugin-next/lib/rules/no-script-in-document'
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

ruleTester.run('no-script-import-in-document', rule, {
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
              <Head/>
            </Html>
          )
        }
      }
      
      export default MyDocument
    `,
      filename: 'pages/_document.js',
    },
    {
      code: `import Document, { Html, Head, Main, NextScript } from 'next/document'

      class MyDocument extends Document {      
        render() {
          return (
            <Html>
              <Head>
                <meta charSet="utf-8" />
              </Head>
            </Html>
          )
        }
      }
      
      export default MyDocument
    `,
      filename: 'pages/_document.tsx',
    },
  ],
  invalid: [
    {
      code: `
      import Document, { Html, Main, NextScript } from 'next/document'
      import Script from 'next/script'
      
      class MyDocument extends Document {
        render() {
          return (
            <Html>
              <Head />
            </Html>
          )
        }
      }
      
      export default MyDocument
      `,
      filename: 'pages/_document.js',
      errors: [
        {
          message: `next/script should not be used in pages/_document.js. See: https://nextjs.org/docs/messages/no-script-in-document-page `,
        },
      ],
    },
    {
      code: `
      import Document, { Html, Main, NextScript } from 'next/document'
      import NextScriptTag from 'next/script'
      
      class MyDocument extends Document {
        render() {
          return (
            <Html>
              <Head>
                <meta charSet="utf-8" />
              </Head>
              <body>
                <Main />
                <NextScript />
                <NextScriptTag />
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
          message: `next/script should not be used in pages/_document.js. See: https://nextjs.org/docs/messages/no-script-in-document-page `,
        },
      ],
    },
  ],
})

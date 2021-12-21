import rule from '@next/eslint-plugin-next/lib/rules/no-styled-jsx-in-document'
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

ruleTester.run('no-styled-jsx-in-document', rule, {
  valid: [
    `import Document, { Html, Head, Main, NextScript } from 'next/document'

        export class MyDocument extends Document {
          static async getInitialProps(ctx) {
            const initialProps = await Document.getInitialProps(ctx)
            return { ...initialProps }
          }
        
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
        }`,
    `import Document, { Html, Head, Main, NextScript } from 'next/document'

        export class MyDocument extends Document {
          static async getInitialProps(ctx) {
            const initialProps = await Document.getInitialProps(ctx)
            return { ...initialProps }
          }
        
          render() {
            return (
              <Html>
                <Head />
                <style>{"\
                  body{\
                    color:red;\
                  }\
                "}</style>
                <body>
                  <Main />
                  <NextScript />
                </body>
              </Html>
            )
          }
        }`,
  ],

  invalid: [
    {
      code: `
            import Document, { Html, Head, Main, NextScript } from 'next/document'

            export class MyDocument extends Document {
              static async getInitialProps(ctx) {
                const initialProps = await Document.getInitialProps(ctx)
                return { ...initialProps }
              }
            
              render() {
                return (
                  <Html>
                    <Head />
                    <style jsx>{"\
                    body{\
                      color:red;\
                    }\
                    "}</style>
                    <body>
                      <Main />
                      <NextScript />
                    </body>
                  </Html>
                )
              }
            }`,
      errors: [
        {
          message: 'Do not use styled-jsx inside pages/_document.js.',
        },
      ],
    },
  ],
})

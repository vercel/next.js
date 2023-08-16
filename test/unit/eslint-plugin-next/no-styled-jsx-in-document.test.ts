import rule from '@next/eslint-plugin-next/dist/rules/no-styled-jsx-in-document'
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
    {
      filename: 'pages/_document.js',
      code: `import Document, { Html, Head, Main, NextScript } from 'next/document'

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
    },
    {
      filename: 'pages/_document.js',
      code: `import Document, { Html, Head, Main, NextScript } from 'next/document'

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
                <style {...{nonce: '123' }}></style>
                <body>
                  <Main />
                  <NextScript />
                </body>
              </Html>
            )
          }
        }`,
    },
    {
      filename: 'pages/index.js',
      code: `
          export default function Page() {
            return (
              <>
                <p>Hello world</p>
                <style jsx>{\`
                  p {
                    color: orange;
                  }
                \`}</style>
              </>
            )
          }
          `,
    },
  ],

  invalid: [
    {
      filename: 'pages/_document.js',
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
          message: `\`styled-jsx\` should not be used in \`pages/_document.js\`. See: https://nextjs.org/docs/messages/no-styled-jsx-in-document`,
        },
      ],
    },
  ],
})

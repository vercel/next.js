const rule = require('@next/eslint-plugin-next/lib/rules/no-page-custom-font')
const RuleTester = require('eslint').RuleTester

RuleTester.setDefaultConfig({
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      modules: true,
      jsx: true,
    },
  },
})

var ruleTester = new RuleTester()
ruleTester.run('no-page-custom-font', rule, {
  valid: [
    `import Document, { Html, Head } from "next/document";

    class MyDocument extends Document {
      render() {
        return (
          <Html>
            <Head>
              <link
                href="https://fonts.googleapis.com/css2?family=Krona+One&display=swap"
                rel="stylesheet"
              />
              <link
                href={process.env.NEXT_PUBLIC_CANONICAL_URL}
                rel="canonical"
              />
              <link
                href={new URL("../public/favicon.ico", import.meta.url).toString()}
                rel="icon"
              />
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
      import Head from 'next/head'

      export default function IndexPage() {
        return (
          <div>
            <Head>
              <link
                href="https://fonts.googleapis.com/css2?family=Inter"
                rel="stylesheet"
              />
            </Head>
            <p>Hello world!</p>
          </div>
        )
      }
      `,
      errors: [
        {
          message:
            'Custom fonts not added at the document level will only load for a single page. This is discouraged. See https://nextjs.org/docs/messages/no-page-custom-font.',
          type: 'JSXOpeningElement',
        },
      ],
    },
    {
      code: `
      import Document, { Html, Head } from "next/document";

      class MyDocument {
        render() {
          return (
            <Html>
              <Head>
                <link
                  href="https://fonts.googleapis.com/css2?family=Krona+One&display=swap"
                  rel="stylesheet"
                />
              </Head>
            </Html>
          );
        }
      }
      
      export default MyDocument;`,
      errors: [
        {
          message:
            'Custom fonts not added at the document level will only load for a single page. This is discouraged. See https://nextjs.org/docs/messages/no-page-custom-font.',
          type: 'JSXOpeningElement',
        },
      ],
    },
  ],
})

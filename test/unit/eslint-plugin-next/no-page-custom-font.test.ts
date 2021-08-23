import rule from '@next/eslint-plugin-next/lib/rules/no-page-custom-font'
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
            </Head>
          </Html>
        );
      }
    }
    
    export default MyDocument;
    `,
    `import NextDocument, { Html, Head } from "next/document";

    class Document extends NextDocument {
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
    
    export default Document;
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

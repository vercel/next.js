import rule from '@next/eslint-plugin-next/dist/rules/no-page-custom-font'
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

const filename = 'pages/_document.js'

ruleTester.run('no-page-custom-font', rule, {
  valid: [
    {
      code: `import Document, { Html, Head } from "next/document";
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
    export default MyDocument;`,
      filename,
    },
    {
      code: `import NextDocument, { Html, Head } from "next/document";
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
      filename,
    },
    {
      code: `export default function CustomDocument() {
      return (
        <Html>
          <Head>
            <link
              href="https://fonts.googleapis.com/css2?family=Krona+One&display=swap"
              rel="stylesheet"
            />
          </Head>
        </Html>
      )
    }`,
      filename,
    },
    {
      code: `function CustomDocument() {
      return (
        <Html>
          <Head>
            <link
              href="https://fonts.googleapis.com/css2?family=Krona+One&display=swap"
              rel="stylesheet"
            />
          </Head>
        </Html>
      )
    }

    export default CustomDocument;
    `,
      filename,
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
      filename,
    },
    {
      code: `export default function() {
      return (
        <Html>
          <Head>
            <link
              href="https://fonts.googleapis.com/css2?family=Krona+One&display=swap"
              rel="stylesheet"
            />
          </Head>
        </Html>
      )
    }`,
      filename,
    },
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
      filename: 'pages/index.tsx',
      errors: [
        {
          message:
            'Custom fonts not added in `pages/_document.js` will only load for a single page. This is discouraged. See: https://nextjs.org/docs/messages/no-page-custom-font',
          type: 'JSXOpeningElement',
        },
      ],
    },
    {
      code: `
      import Head from 'next/head'


      function Links() {
        return (
          <>
            <link
              href="https://fonts.googleapis.com/css2?family=Inter"
              rel="stylesheet"
            />
            <link
              href="https://fonts.googleapis.com/css2?family=Open+Sans"
              rel="stylesheet"
              />
          </>
        )
      }

      export default function IndexPage() {
        return (
          <div>
            <Head>
              <Links />
            </Head>
            <p>Hello world!</p>
          </div>
        )
      }
      `,
      filename,
      errors: [
        {
          message:
            'Using `<link />` outside of `<Head>` will disable automatic font optimization. This is discouraged. See: https://nextjs.org/docs/messages/no-page-custom-font',
        },
        {
          message:
            'Using `<link />` outside of `<Head>` will disable automatic font optimization. This is discouraged. See: https://nextjs.org/docs/messages/no-page-custom-font',
        },
      ],
    },
  ],
})

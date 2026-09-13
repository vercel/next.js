import { Linter, RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-page-custom-font']

const filename = 'pages/_document.js'

const tests = {
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
    {
      code: `
      export default function RootLayout({ children }) {
        return (
          <html lang="en">
            <head>
              <link
                href="https://fonts.googleapis.com/css2?family=Inter"
                rel="stylesheet"
              />
            </head>
            <body>{children}</body>
          </html>
        )
      }
      `,
      filename: 'packages/web/src/app/layout.tsx',
    },
    {
      code: `
      export default function Component() {
        return (
          <link
            href="https://fonts.googleapis.com/css2?family=Inter"
            rel="stylesheet"
          />
        )
      }
      `,
      filename: 'webpages/index.tsx',
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
      filename: 'packages/web/src/pages/index.tsx',
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
}

describe('no-page-custom-font', () => {
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

  it('detects pages files when cwd is the pages directory', () => {
    const linter = new Linter({
      cwd: '/repo/pages',
      configType: 'eslintrc',
    })
    linter.defineRule('no-page-custom-font', NextESLintRule)

    const messages = linter.verify(
      `
      import Head from 'next/head'
      export default function IndexPage() {
        return (
          <Head>
            <link
              href="https://fonts.googleapis.com/css2?family=Inter"
              rel="stylesheet"
            />
          </Head>
        )
      }
      `,
      {
        parserOptions: {
          ecmaVersion: 2018,
          sourceType: 'module',
          ecmaFeatures: {
            modules: true,
            jsx: true,
          },
        },
        rules: {
          'no-page-custom-font': 2,
        },
      },
      { filename: '/repo/pages/index.tsx' }
    )

    expect(messages).toHaveLength(1)
    expect(messages[0].message).toBe(
      'Custom fonts not added in `pages/_document.js` will only load for a single page. This is discouraged. See: https://nextjs.org/docs/messages/no-page-custom-font'
    )
  })
})

import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-before-interactive-script-outside-document']

const message =
  "`next/script`'s `beforeInteractive` strategy should not be used outside of `pages/_document.js`. See: https://nextjs.org/docs/messages/no-before-interactive-script-outside-document"

const tests = {
  valid: [
    {
      code: `
      import Document, { Html, Main, NextScript } from 'next/document'
      import Script from 'next/script'

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
                <Script
                  id="scriptBeforeInteractive"
                  src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforeInteractive"
                  strategy="beforeInteractive"
                ></Script>
              </body>
            </Html>
          )
        }
      }

      export default MyDocument
      `,
      filename: 'pages/_document.js',
    },
    {
      code: `
      import Document, { Html, Main, NextScript } from 'next/document'
      import ScriptComponent from 'next/script'

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
                <ScriptComponent
                  id="scriptBeforeInteractive"
                  src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforeInteractive"
                  strategy="beforeInteractive"
                ></ScriptComponent>
              </body>
            </Html>
          )
        }
      }

      export default MyDocument
      `,
      filename: 'pages/_document.tsx',
    },
    {
      code: `
      import Document, { Html, Main, NextScript } from 'next/document'
      import ScriptComponent from 'next/script'

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
                <ScriptComponent
                  id="scriptBeforeInteractive"
                  src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforeInteractive"
                ></ScriptComponent>
              </body>
            </Html>
          )
        }
      }

      export default MyDocument
      `,
      filename: 'pages/_document.tsx',
    },
    {
      code: `
      import Script from "next/script";

      export default function Index() {
        return (
          <html lang="en">
            <body className={inter.className}>{children}</body>
            <Script
              src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforeInteractive"
              strategy='beforeInteractive'
            />
          </html>
        );
      }`,
      filename: '/Users/user_name/projects/project-name/app/layout.tsx',
    },
    {
      code: `
      import Script from "next/script";

      export default function test() {
        return (
          <html lang="en">
            <body className={inter.className}>{children}</body>
            <Script
              src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforeInteractive"
              strategy='beforeInteractive'
            />
          </html>
        );
      }`,
      filename: 'C:\\Users\\username\\projects\\project-name\\app\\layout.tsx',
    },
    {
      code: `
      import Script from "next/script";

      export default function Index() {
        return (
          <html lang="en">
            <body className={inter.className}>{children}</body>
            <Script
              src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforeInteractive"
              strategy='beforeInteractive'
            />
          </html>
        );
      }`,
      filename: '/Users/user_name/projects/project-name/src/app/layout.tsx',
    },
    {
      code: `
      import Script from "next/script";

      export default function test() {
        return (
          <html lang="en">
            <body className={inter.className}>{children}</body>
            <Script
              src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforeInteractive"
              strategy='beforeInteractive'
            />
          </html>
        );
      }`,
      filename:
        'C:\\Users\\username\\projects\\project-name\\src\\app\\layout.tsx',
    },
  ],
  invalid: [
    {
      code: `
      import Head from "next/head";
      import Script from "next/script";

      export default function Index() {
        return (
          <Script
            id="scriptBeforeInteractive"
            src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforeInteractive"
            strategy="beforeInteractive"
          ></Script>
        );
      }`,
      filename: 'pages/index.js',
      errors: [{ message }],
    },
    {
      code: `
      import Head from "next/head";
      import Script from "next/script";

      export default function Index() {
        return (
          <Script
            id="scriptBeforeInteractive"
            src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforeInteractive"
            strategy="beforeInteractive"
          ></Script>
        );
      }`,
      filename: 'components/outside-known-dirs.js',
      errors: [{ message }],
    },
    {
      code: `
      import Script from "next/script";

      export default function Index() {
        return (
          <html lang="en">
            <body className={inter.className}>{children}</body>
            <Script
              src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforeInteractive"
              strategy='beforeInteractive'
            />
          </html>
        );
      }`,
      filename: '/Users/user_name/projects/project-name/pages/layout.tsx',
      errors: [{ message }],
    },
    {
      code: `
      import Script from "next/script";

      export default function Index() {
        return (
          <html lang="en">
            <body className={inter.className}>{children}</body>
            <Script
              src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforeInteractive"
              strategy='beforeInteractive'
            />
          </html>
        );
      }`,
      filename:
        'C:\\Users\\username\\projects\\project-name\\pages\\layout.tsx',
      errors: [{ message }],
    },
    {
      code: `
      import Script from "next/script";

      export default function Index() {
        return (
          <html lang="en">
            <body className={inter.className}>{children}</body>
            <Script
              src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforeInteractive"
              strategy='beforeInteractive'
            />
          </html>
        );
      }`,
      filename: '/Users/user_name/projects/project-name/src/pages/layout.tsx',
      errors: [{ message }],
    },
    {
      code: `
      import Script from "next/script";

      export default function test() {
        return (
          <html lang="en">
            <body className={inter.className}>{children}</body>
            <Script
              src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforeInteractive"
              strategy='beforeInteractive'
            />
          </html>
        );
      }`,
      filename:
        'C:\\Users\\username\\projects\\project-name\\src\\pages\\layout.tsx',
      errors: [{ message }],
    },
  ],
}

describe('no-before-interactive-script-outside-document', () => {
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
})

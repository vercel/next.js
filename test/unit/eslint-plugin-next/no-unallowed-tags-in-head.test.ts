import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-unallowed-tags-in-head']

const url = 'https://nextjs.org/docs/messages/no-unallowed-tags-in-head'

const tests = {
  valid: [
    // Valid head tags
    {
      code: `import Head from 'next/head'
        export default function Page() {
          return <Head><title>My Title</title></Head>
        }`,
      filename: 'pages/index.js',
    },
    {
      code: `import Head from 'next/head'
        export default function Page() {
          return <Head><meta name="desc" content="hello" /></Head>
        }`,
      filename: 'pages/index.js',
    },
    {
      code: `import Head from 'next/head'
        export default function Page() {
          return <Head><link rel="icon" href="/favicon.ico" /></Head>
        }`,
      filename: 'pages/index.js',
    },
    {
      code: `import Head from 'next/head'
        export default function Page() {
          return <Head><style>{'body { color: red }'}</style></Head>
        }`,
      filename: 'pages/index.js',
    },
    {
      code: `import Head from 'next/head'
        export default function Page() {
          return <Head><base href="/" /></Head>
        }`,
      filename: 'pages/index.js',
    },
    // Fragment wrapping is OK
    {
      code: `import Head from 'next/head'
        export default function Page() {
          return <Head><><title>My Title</title><meta name="desc" content="hello" /></></Head>
        }`,
      filename: 'pages/index.js',
    },
    // Custom component (PascalCase) is OK
    {
      code: `import Head from 'next/head'
        const MyMeta = () => <meta name="custom" content="val" />
        export default function Page() {
          return <Head><MyMeta /></Head>
        }`,
      filename: 'pages/index.js',
    },
    // No next/head import — should not trigger
    {
      code: `export default function Page() {
          return <head><html lang="en" /></head>
        }`,
      filename: 'pages/index.js',
    },
    // Multiple valid tags
    {
      code: `import Head from 'next/head'
        export default function Page() {
          return <Head>
            <title>My Page</title>
            <meta name="viewport" content="width=device-width" />
            <link rel="stylesheet" href="/styles.css" />
            <noscript>Your browser does not support JavaScript.</noscript>
          </Head>
        }`,
      filename: 'pages/index.js',
    },
  ],

  invalid: [
    // <html> inside <Head>
    {
      code: `import Head from 'next/head'
        export default function Page() {
          return <Head><html lang="en" /><title>My Title</title></Head>
        }`,
      filename: 'pages/index.js',
      errors: [
        {
          messageId: 'invalidTag',
          data: { tag: 'html', url },
        },
      ],
    },
    // <body> inside <Head>
    {
      code: `import Head from 'next/head'
        export default function Page() {
          return <Head><body><title>My Title</title></body></Head>
        }`,
      filename: 'pages/index.js',
      errors: [
        {
          messageId: 'invalidTag',
          data: { tag: 'body', url },
        },
      ],
    },
    // <div> inside <Head>
    {
      code: `import Head from 'next/head'
        export default function Page() {
          return <Head><div>content</div></Head>
        }`,
      filename: 'pages/index.js',
      errors: [{ messageId: 'invalidTag' }],
    },
    // <main> inside <Head>
    {
      code: `import Head from 'next/head'
        export default function Page() {
          return <Head><main>content</main></Head>
        }`,
      filename: 'pages/index.js',
      errors: [{ messageId: 'invalidTag' }],
    },
    // <section> inside <Head>
    {
      code: `import Head from 'next/head'
        export default function Page() {
          return <Head><section>content</section></Head>
        }`,
      filename: 'pages/index.js',
      errors: [{ messageId: 'invalidTag' }],
    },
    // Multiple invalid tags
    {
      code: `import Head from 'next/head'
        export default function Page() {
          return <Head><html lang="en" /><body className="dark"></body></Head>
        }`,
      filename: 'pages/index.js',
      errors: [{ messageId: 'invalidTag' }, { messageId: 'invalidTag' }],
    },
    // Invalid tag inside Fragment
    {
      code: `import Head from 'next/head'
        export default function Page() {
          return <Head><><div>content</div><title>My Title</title></></Head>
        }`,
      filename: 'pages/index.js',
      errors: [{ messageId: 'invalidTag' }],
    },
    // <h1> inside <Head>
    {
      code: `import Head from 'next/head'
        export default function Page() {
          return <Head><h1>My Title</h1></Head>
        }`,
      filename: 'pages/index.js',
      errors: [{ messageId: 'invalidTag' }],
    },
  ],
}

describe('no-unallowed-tags-in-head', () => {
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

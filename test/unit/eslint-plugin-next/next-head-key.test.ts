import rule from '@next/eslint-plugin-next/lib/rules/next-head-key'
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

const errorMessage =
  '`next/head` components with inline content must specify an `key` attribute. See: https://nextjs.org/docs/messages/next-head-key'

const ruleTester = new RuleTester()
ruleTester.run('next-head-key', rule, {
  valid: [
    {
      code: `import Head from 'next/head';

      export default function TestPage() {
        return (
          <Head>
            <title>Blah Blah</title>
            <meta key="test-head" charSet="utf-8" />
          </Head>
        )
      }`,
    },
    {
      code: `import Head from 'next/head';

      export default function TestPage() {
        return (
          <Head
            dangerouslySetInnerHTML={{
              __html: \`<title>Blah Blah</title>
              <meta key="test-head" charSet="utf-8" />\`
            }}
          />
        )
      }`,
    },
    {
      code: `import Head from 'next/head';

      export default function TestPage() {
        return (
          <Head src="https://example.com" />
        )
      }`,
    },
    {
      code: `import MyHead from 'next/head';

      export default function TestPage() {
        return (
          <MyHead key="test-head">
            <>
            <title>Blah Blah</title>
            <meta key="test-head" charSet="utf-8" />
            </>
          </MyHead>
        )
      }`,
    },
    {
      code: `import MyHead from 'next/head';

      export default function TestPage() {
        return (
          <MyHead
            key="test-head"
            dangerouslySetInnerHTML={{
              __html: \`<title>Blah Blah</title>
              <meta key="test-head" charSet="utf-8" />\`
            }}
          />
        )
      }`,
    },
    {
      code: `import Head from 'next/head';

      export default function TestPage() {
        return (
          <Head {...{ strategy: "lazyOnload" }}>
            <>
            <title>Blah Blah</title>
            <meta key={"test-head"} charSet="utf-8" />
            </>
          </Head>
        )
      }`,
    },
    {
      code: `import Head from 'next/head';

      export default function TestPage() {
        return (
          <Head {...{ strategy: "lazyOnload" }}>
            <title>Blah Blah</title>
            <meta key={"test-head"} charSet="utf-8" />
          </Head>
        )
      }`,
    },
    {
      code: `import Head from 'next/head';

      export default function TestPage() {
        return (
          <Head {...{ strategy: "lazyOnload"}}>
            <title>Blah Blah</title>
            <meta key={"test-head"} charSet="utf-8" />
          </Head>
        )
      }`,
    },
    {
      code: `import Head from 'next/head';
      const spread = { strategy: "lazyOnload" }
      export default function TestPage() {
        return (
          <Head {...spread}>
            <title>Blah Blah</title>
            <meta key={"test-head"} charSet="utf-8" />
            <meta key={"test-head2"} charSet="utf-8" />
          </Head>
        )
      }`,
    },
  ],
  invalid: [
    {
      code: `import Head from 'next/head';

        export default function TestPage() {
          return (
            <Head>
              <title>Blah Blah</title>
              <meta charSet="utf-8" />
            </Head>
          )
        }`,
      errors: [
        {
          message: errorMessage,
          type: 'JSXElement',
        },
      ],
    },
    {
      code: `import Head from 'next/head';

        export default function TestPage() {
          return (
            <Head>
              <>
              <title>Blah Blah</title>
              <meta charSet="utf-8" />
              </>
            </Head>
          )
        }`,
      errors: [
        {
          message: errorMessage,
          type: 'JSXElement',
        },
      ],
    },
    {
      code: `import Head from 'next/head';

        export default function TestPage() {
          return (
            <Head
              dangerouslySetInnerHTML={{
                __html: \`<Head>
                <meta charSet="utf-8" />
                <meta charSet="utf-8" />
                </Head>\`
              }}
            />
          )
        }`,
      errors: [
        {
          message: errorMessage,
          type: 'JSXElement',
        },
      ],
    },
    {
      code: `import MyHead from 'next/head';

        export default function TestPage() {
          return (
            <MyHead>
              <>
                <meta charSet="utf-8" />
                <meta charSet="utf-8" />
              </>
            </MyHead>
          )
        }`,
      errors: [
        {
          message: errorMessage,
          type: 'JSXElement',
        },
      ],
    },
  ],
})

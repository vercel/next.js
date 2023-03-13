import rule from '@next/eslint-plugin-next/dist/rules/inline-script-id'
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
  '`next/script` components with inline content must specify an `id` attribute. See: https://nextjs.org/docs/messages/inline-script-id'

const ruleTester = new RuleTester()
ruleTester.run('inline-script-id', rule, {
  valid: [
    {
      code: `import Script from 'next/script';

      export default function TestPage() {
        return (
          <Script id="test-script">
            {\`console.log('Hello world');\`}
          </Script>
        )
      }`,
    },
    {
      code: `import Script from 'next/script';

      export default function TestPage() {
        return (
          <Script
            id="test-script"
            dangerouslySetInnerHTML={{
              __html: \`console.log('Hello world');\`
            }}
          />
        )
      }`,
    },
    {
      code: `import Script from 'next/script';

      export default function TestPage() {
        return (
          <Script src="https://example.com" />
        )
      }`,
    },
    {
      code: `import MyScript from 'next/script';

      export default function TestPage() {
        return (
          <MyScript id="test-script">
            {\`console.log('Hello world');\`}
          </MyScript>
        )
      }`,
    },
    {
      code: `import MyScript from 'next/script';

      export default function TestPage() {
        return (
          <MyScript
            id="test-script"
            dangerouslySetInnerHTML={{
              __html: \`console.log('Hello world');\`
            }}
          />
        )
      }`,
    },
    {
      code: `import Script from 'next/script';

      export default function TestPage() {
        return (
          <Script {...{ strategy: "lazyOnload" }} id={"test-script"}>
            {\`console.log('Hello world');\`}
          </Script>
        )
      }`,
    },
    {
      code: `import Script from 'next/script';

      export default function TestPage() {
        return (
          <Script {...{ strategy: "lazyOnload", id: "test-script" }}>
            {\`console.log('Hello world');\`}
          </Script>
        )
      }`,
    },
    {
      code: `import Script from 'next/script';
      const spread = { strategy: "lazyOnload" }
      export default function TestPage() {
        return (
          <Script {...spread} id={"test-script"}>
            {\`console.log('Hello world');\`}
          </Script>
        )
      }`,
    },
  ],
  invalid: [
    {
      code: `import Script from 'next/script';

        export default function TestPage() {
          return (
            <Script>
              {\`console.log('Hello world');\`}
            </Script>
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
      code: `import Script from 'next/script';

        export default function TestPage() {
          return (
            <Script
              dangerouslySetInnerHTML={{
                __html: \`console.log('Hello world');\`
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
      code: `import MyScript from 'next/script';

        export default function TestPage() {
          return (
            <MyScript>
              {\`console.log('Hello world');\`}
            </MyScript>
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
      code: `import MyScript from 'next/script';

        export default function TestPage() {
          return (
            <MyScript
              dangerouslySetInnerHTML={{
                __html: \`console.log('Hello world');\`
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
  ],
})

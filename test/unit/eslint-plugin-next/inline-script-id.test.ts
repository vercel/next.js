import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['inline-script-id']

const errorMessage =
  '`next/script` components with inline content must specify an `id` attribute. See: https://nextjs.org/docs/messages/inline-script-id'

const tests = {
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
}

describe('inline-script-id', () => {
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

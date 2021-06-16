const rule = require('@next/eslint-plugin-next/lib/rules/no-document-import-in-page')

const RuleTester = require('eslint').RuleTester

RuleTester.setDefaultConfig({
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      modules: true,
      jsx: true,
    },
  },
})

var ruleTester = new RuleTester()
ruleTester.run('no-document-import-in-page', rule, {
  valid: [
    {
      code: `import Document from "next/document"

    export default class MyDocument extends Document {
      render() {
        return (
          <Html>
          </Html>
        );
      }
    }
    `,
      filename: 'pages/_document.js',
    },
    {
      code: `import Document from "next/document"

    export default class MyDocument extends Document {
      render() {
        return (
          <Html>
          </Html>
        );
      }
    }
    `,
      filename: 'pages/_document.tsx',
    },
    {
      code: `import Document from "next/document"

    export default class MyDocument extends Document {
      render() {
        return (
          <Html>
          </Html>
        );
      }
    }
    `,
      filename: 'pages/_document.page.tsx',
    },
  ],
  invalid: [
    {
      code: `import Document from "next/document"

      export const Test = () => (
          <p>Test</p>
      )
      `,
      filename: 'pages/test.js',
      errors: [
        {
          message:
            'next/document should not be imported outside of pages/_document.js. See https://nextjs.org/docs/messages/no-document-import-in-page.',
          type: 'ImportDeclaration',
        },
      ],
    },
  ],
})

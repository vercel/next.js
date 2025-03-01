import { RuleTester as ESLintTesterV8 } from 'eslint-v8'
import { RuleTester as ESLintTesterV9 } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-document-import-in-page']

const tests = {
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
      filename: 'pages/_document.page.tsx',
    },
    {
      code: `import NDocument from "next/document"

    export default class Document extends NDocument {
      render() {
        return (
          <Html>
          </Html>
        );
      }
    }
    `,
      filename: 'pages/_document/index.js',
    },
    {
      code: `import NDocument from "next/document"

    export default class Document extends NDocument {
      render() {
        return (
          <Html>
          </Html>
        );
      }
    }
    `,
      filename: 'pages/_document/index.tsx',
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
      filename: 'pagesapp/src/pages/_document.js',
    },
  ],
  invalid: [
    {
      code: `import Document from "next/document"

      export const Test = () => <p>Test</p>
      `,
      filename: 'components/test.js',
      errors: [
        {
          message:
            '`<Document />` from `next/document` should not be imported outside of `pages/_document.js`. See: https://nextjs.org/docs/messages/no-document-import-in-page',
          type: 'ImportDeclaration',
        },
      ],
    },
    {
      code: `import Document from "next/document"

      export const Test = () => <p>Test</p>
      `,
      filename: 'pages/test.js',
      errors: [
        {
          message:
            '`<Document />` from `next/document` should not be imported outside of `pages/_document.js`. See: https://nextjs.org/docs/messages/no-document-import-in-page',
          type: 'ImportDeclaration',
        },
      ],
    },
  ],
}

describe('no-document-import-in-page', () => {
  new ESLintTesterV8({
    parserOptions: {
      ecmaVersion: 2018,
      sourceType: 'module',
      ecmaFeatures: {
        modules: true,
        jsx: true,
      },
    },
  }).run('eslint-v8', NextESLintRule, tests)

  new ESLintTesterV9({
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
  }).run('eslint-v9', NextESLintRule, tests)
})

import path from 'path'

import rule from '@next/eslint-plugin-next/dist/rules/no-document-import-in-page'
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
      filename: `pages${path.sep}_document.js`,
    },
    {
      code: `import NextDocument from "next/document"

    export default class MyDocument extends NextDocument {
      render() {
        return (
          <Html>
          </Html>
        );
      }
    }
    `,
      filename: `pages${path.posix.sep}_document.tsx`,
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
    {
      code: `import Document from "next/document"

      export const Test = () => <p>Test</p>
      `,
      filename: `pages${path.sep}test.js`,
      errors: [
        {
          message:
            '`<Document />` from `next/document` should not be imported outside of `pages/_document.js`. See: https://nextjs.org/docs/messages/no-document-import-in-page',
          type: 'ImportDeclaration',
        },
      ],
    },
  ],
})

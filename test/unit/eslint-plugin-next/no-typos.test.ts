import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-typos']

const tests = {
  valid: [
    `
      export default function Page() {
        return <div></div>;
      }
      export const getStaticPaths = async () => {};
      export const getStaticProps = async () => {};
    `,
    `
      export default function Page() {
        return <div></div>;
      }
      export const getServerSideProps = async () => {};
    `,
    `
      export default function Page() {
        return <div></div>;
      }
      export async function getStaticPaths() {};
      export async function getStaticProps() {};
    `,
    `
      export default function Page() {
        return <div></div>;
      }
      export async function getServerSideProps() {};
    `,
    // detect only typo that is one operation away from the correct one
    `
      export default function Page() {
        return <div></div>;
      }
      export async function getServerSidePropsss() {};
    `,
    `
      export default function Page() {
        return <div></div>;
      }
      export async function getstatisPath() {};
    `,
    // API routes have their own exports, so they're not checked for typos.
    {
      code: `
        export default function handler(req, res) {};
        export const getStaticpaths = async () => {};
      `,
      filename: 'pages/api/hello.js',
    },
    {
      // Same file on Windows, where `context.filename` uses backslashes.
      code: `
        export default function handler(req, res) {};
        export const getStaticpaths = async () => {};
      `,
      filename: 'pages\\api\\hello.js',
    },
  ],
  invalid: [
    {
      code: `
        export default function Page() {
          return <div></div>;
        }
        export const getStaticpaths = async () => {};
        export const getStaticProps = async () => {};
      `,
      filename: 'pages/index.js',
      errors: [
        {
          message: 'getStaticpaths may be a typo. Did you mean getStaticPaths?',
          type: 'ExportNamedDeclaration',
        },
      ],
    },
    {
      code: `
        export default function Page() {
          return <div></div>;
        }
        export async function getStaticPathss(){};
        export async function getStaticPropss(){};
      `,
      filename: 'pages/index.js',
      errors: [
        {
          message:
            'getStaticPathss may be a typo. Did you mean getStaticPaths?',
          type: 'ExportNamedDeclaration',
        },
        {
          message:
            'getStaticPropss may be a typo. Did you mean getStaticProps?',
          type: 'ExportNamedDeclaration',
        },
      ],
    },
    {
      code: `
        export default function Page() {
          return <div></div>;
        }
        export async function getServurSideProps(){};
      `,
      filename: 'pages/index.js',
      errors: [
        {
          message:
            'getServurSideProps may be a typo. Did you mean getServerSideProps?',
          type: 'ExportNamedDeclaration',
        },
      ],
    },
    {
      code: `
        export default function Page() {
          return <div></div>;
        }
        export const getServurSideProps = () => {};
      `,
      filename: 'pages/index.js',
      errors: [
        {
          message:
            'getServurSideProps may be a typo. Did you mean getServerSideProps?',
          type: 'ExportNamedDeclaration',
        },
      ],
    },
    {
      // A directory that merely starts with "api" is a normal page.
      code: `
        export default function Page() {
          return <div></div>;
        }
        export const getStaticpaths = async () => {};
      `,
      filename: 'pages/apixyz/index.js',
      errors: [
        {
          message: 'getStaticpaths may be a typo. Did you mean getStaticPaths?',
          type: 'ExportNamedDeclaration',
        },
      ],
    },
    {
      // Windows path for a regular page, which must still be checked.
      code: `
        export default function Page() {
          return <div></div>;
        }
        export const getStaticpaths = async () => {};
      `,
      filename: 'pages\\blog\\index.js',
      errors: [
        {
          message: 'getStaticpaths may be a typo. Did you mean getStaticPaths?',
          type: 'ExportNamedDeclaration',
        },
      ],
    },
  ],
}

describe('no-typos', () => {
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

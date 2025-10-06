import { RuleTester as ESLintTesterV8 } from 'eslint-v8'
import { RuleTester as ESLintTesterV9 } from 'eslint'
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
  ],
}

describe('no-typos', () => {
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

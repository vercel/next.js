import rule from '@next/eslint-plugin-next/dist/rules/no-typos'
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

ruleTester.run('no-typos', rule, {
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
})

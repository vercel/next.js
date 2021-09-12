import rule from '@next/eslint-plugin-next/lib/rules/no-script-in-head'
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

ruleTester.run('no-script-in-head', rule, {
  valid: [
    `import Script from "next/script";
     const Head = ({children}) => children

    export default function Index() {
      return (
        <Head>
          <Script></Script>
        </Head>
      );
    }
    `,
  ],

  invalid: [
    {
      code: `
      import Head from "next/head";
      import Script from "next/script";
      
      export default function Index() {
        return (
            <Head>
              <Script></Script>
            </Head>
        );
      }`,
      filename: 'pages/index.js',
      errors: [
        {
          message:
            "next/script shouldn't be used inside next/head. See: https://nextjs.org/docs/messages/no-script-in-head-component ",
        },
      ],
    },
  ],
})

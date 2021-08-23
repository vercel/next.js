const rule = require('@next/eslint-plugin-next/lib/rules/google-font-display')
const RuleTester = require('eslint').RuleTester

RuleTester.setDefaultConfig({
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      modules: true,
      jsx: true,
    },
  },
})

var ruleTester = new RuleTester()
ruleTester.run('google-font-display', rule, {
  valid: [
    `import Head from "next/head";

     export default Test = () => {
      return (
        <Head>
          <link href={test} rel="test" />
          <link
            href={process.env.NEXT_PUBLIC_CANONICAL_URL}
            rel="canonical"
          />
          <link
            href={new URL("../public/favicon.ico", import.meta.url).toString()}
            rel="icon"
          />
          <link
            href="https://fonts.googleapis.com/css2?family=Krona+One&display=optional"
            rel="stylesheet"
          />
        </Head>
      );
     };
    `,

    `import Document, { Html, Head } from "next/document";

     class MyDocument extends Document {
      render() {
        return (
          <Html>
            <Head>
              <link
                href="https://fonts.googleapis.com/css?family=Krona+One&display=swap"
                rel="stylesheet"
              />
            </Head>
          </Html>
        );
      }
     }
    
     export default MyDocument;
    `,
  ],

  invalid: [
    {
      code: `import Head from "next/head";

      export default Test = () => {
       return (
         <Head>
           <link
             href="https://fonts.googleapis.com/css2?family=Krona+One"
             rel="stylesheet"
           />
         </Head>
       );
      };
     `,
      errors: [
        {
          message:
            'Display parameter is missing. See https://nextjs.org/docs/messages/google-font-display.',
          type: 'JSXOpeningElement',
        },
      ],
    },
    {
      code: `import Head from "next/head";

      export default Test = () => {
       return (
         <Head>
           <link
             href="https://fonts.googleapis.com/css2?family=Krona+One&display=block"
             rel="stylesheet"
           />
         </Head>
       );
      };
     `,
      errors: [
        {
          message:
            'Block behavior is not recommended. See https://nextjs.org/docs/messages/google-font-display.',
          type: 'JSXOpeningElement',
        },
      ],
    },
    {
      code: `import Head from "next/head";

      export default Test = () => {
       return (
         <Head>
           <link
             href="https://fonts.googleapis.com/css2?family=Krona+One&display=auto"
             rel="stylesheet"
           />
         </Head>
       );
      };
     `,
      errors: [
        {
          message:
            'Auto behavior is not recommended. See https://nextjs.org/docs/messages/google-font-display.',
          type: 'JSXOpeningElement',
        },
      ],
    },
    {
      code: `import Head from "next/head";

      export default Test = () => {
       return (
         <Head>
           <link
             href="https://fonts.googleapis.com/css2?display=fallback&family=Krona+One"
             rel="stylesheet"
           />
         </Head>
       );
      };
     `,
      errors: [
        {
          message:
            'Fallback behavior is not recommended. See https://nextjs.org/docs/messages/google-font-display.',
          type: 'JSXOpeningElement',
        },
      ],
    },
  ],
})

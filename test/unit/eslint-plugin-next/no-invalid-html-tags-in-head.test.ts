import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-invalid-html-tags-in-head']

const url = 'https://nextjs.org/docs/messages/no-invalid-html-tags-in-head'

const tests = {
  valid: [
    // Valid HTML head elements should be allowed
    `import Head from "next/head";
     export default function Index() {
       return (
         <Head>
           <title>My Page</title>
           <meta name="description" content="Test" />
           <link rel="canonical" href="https://example.com" />
           <script src="/script.js" />
           <style>{'body { margin: 0; }'}</style>
           <base href="/" />
           <noscript>Please enable JS</noscript>
         </Head>
       );
     }`,
    // Non-next/head Head component should not be linted
    `const Head = ({ children }) => <div>{children}</div>;
     export default function Index() {
       return (
         <Head>
           <html lang="en" />
         </Head>
       );
     }`,
    // No next/head import — no lint
    `export default function Index() {
       return (
         <Head>
           <div>invalid</div>
         </Head>
       );
     }`,
    // React components (capitalized) inside Head are allowed
    `import Head from "next/head";
     export default function Index() {
       return (
         <Head>
           <MyMeta />
           <title>Page</title>
         </Head>
       );
     }`,
  ],

  invalid: [
    {
      code: `
        import Head from "next/head";
        export default function Index() {
          return (
            <Head>
              <html lang="en" />
            </Head>
          );
        }`,
      errors: [
        {
          message: `\`<html>\` is not a valid element inside \`<Head>\` from \`next/head\`. Only elements valid inside \`<head>\` are allowed (title, base, link, meta, script, style, noscript, template). See: ${url}`,
        },
      ],
    },
    {
      code: `
        import Head from "next/head";
        export default function Index() {
          return (
            <Head>
              <body class="dark" />
            </Head>
          );
        }`,
      errors: [
        {
          message: `\`<body>\` is not a valid element inside \`<Head>\` from \`next/head\`. Only elements valid inside \`<head>\` are allowed (title, base, link, meta, script, style, noscript, template). See: ${url}`,
        },
      ],
    },
    {
      code: `
        import Head from "next/head";
        export default function Index() {
          return (
            <Head>
              <div className="meta-group">
                <meta name="foo" content="bar" />
              </div>
            </Head>
          );
        }`,
      errors: [
        {
          message: `\`<div>\` is not a valid element inside \`<Head>\` from \`next/head\`. Only elements valid inside \`<head>\` are allowed (title, base, link, meta, script, style, noscript, template). See: ${url}`,
        },
      ],
    },
    {
      code: `
        import NextHead from "next/head";
        export default function Index() {
          return (
            <NextHead>
              <span>invalid</span>
            </NextHead>
          );
        }`,
      errors: [
        {
          message: `\`<span>\` is not a valid element inside \`<Head>\` from \`next/head\`. Only elements valid inside \`<head>\` are allowed (title, base, link, meta, script, style, noscript, template). See: ${url}`,
        },
      ],
    },
  ],
}

describe('no-invalid-html-tags-in-head', () => {
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

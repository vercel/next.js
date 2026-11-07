import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-invalid-head-children']

const errorMessage = (element: string) =>
  `\`<${element}>\` is not a valid child of \`next/head\`. Only \`<title>\`, \`<meta>\`, \`<link>\`, \`<script>\`, \`<style>\`, \`<base>\`, and \`<noscript>\` are allowed. Using invalid elements can cause the "next-head-count is missing" error. See: https://nextjs.org/docs/messages/no-invalid-head-children`

const ruleTester = new RuleTester({
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
})

const tests = {
  valid: [
    // Valid: title element
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <title>Page Title</title>
            </Head>
          );
        }
      `,
    },
    // Valid: meta element
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <meta name="description" content="A description" />
            </Head>
          );
        }
      `,
    },
    // Valid: link element
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <link rel="canonical" href="https://example.com" />
            </Head>
          );
        }
      `,
    },
    // Valid: script element (native, not next/script)
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <script type="application/ld+json">{"@context": "https://schema.org"}</script>
            </Head>
          );
        }
      `,
    },
    // Valid: style element
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <style>{"body { margin: 0; }"}</style>
            </Head>
          );
        }
      `,
    },
    // Valid: base element
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <base href="https://example.com/" />
            </Head>
          );
        }
      `,
    },
    // Valid: noscript element
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <noscript>JavaScript is required</noscript>
            </Head>
          );
        }
      `,
    },
    // Valid: multiple valid elements
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <title>My Page</title>
              <meta name="description" content="Description" />
              <link rel="icon" href="/favicon.ico" />
            </Head>
          );
        }
      `,
    },
    // Valid: React component (PascalCase) - allowed since it may render valid elements
    {
      code: `
        import Head from "next/head";
        const MetaComponent = () => <meta name="test" content="test" />;
        export default function Page() {
          return (
            <Head>
              <MetaComponent />
            </Head>
          );
        }
      `,
    },
    // Valid: Not using next/head import (different Head component)
    {
      code: `
        const Head = ({children}) => <div>{children}</div>;
        export default function Page() {
          return (
            <Head>
              <div>This is fine</div>
            </Head>
          );
        }
      `,
    },
    // Valid: Renamed import
    {
      code: `
        import MyHead from "next/head";
        export default function Page() {
          return (
            <MyHead>
              <title>Valid</title>
            </MyHead>
          );
        }
      `,
    },
    // Valid: Head element not from next/head
    {
      code: `
        import { Helmet as Head } from "react-helmet";
        export default function Page() {
          return (
            <Head>
              <html lang="en" />
            </Head>
          );
        }
      `,
    },
  ],

  invalid: [
    // Invalid: html element inside Head
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <html lang="en" />
              <title>Page</title>
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('html') }],
    },
    // Invalid: body element inside Head
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <body className="dark" />
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('body') }],
    },
    // Invalid: div element inside Head
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <div>Invalid</div>
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('div') }],
    },
    // Invalid: span element inside Head
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <span>Invalid</span>
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('span') }],
    },
    // Invalid: p element inside Head
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <p>Invalid paragraph</p>
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('p') }],
    },
    // Invalid: header element inside Head
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <header>Invalid</header>
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('header') }],
    },
    // Invalid: img element inside Head
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <img src="/logo.png" alt="Logo" />
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('img') }],
    },
    // Invalid: multiple invalid elements
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <html lang="en" />
              <div>Content</div>
              <title>Page</title>
            </Head>
          );
        }
      `,
      errors: [
        { message: errorMessage('html') },
        { message: errorMessage('div') },
      ],
    },
    // Invalid: with renamed import
    {
      code: `
        import MyHead from "next/head";
        export default function Page() {
          return (
            <MyHead>
              <div>Invalid</div>
            </MyHead>
          );
        }
      `,
      errors: [{ message: errorMessage('div') }],
    },
    // Invalid: form element
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <form>Invalid form</form>
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('form') }],
    },
    // Invalid: nav element
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <nav>Navigation</nav>
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('nav') }],
    },
    // Invalid: section element
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <section>Section content</section>
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('section') }],
    },
    // Invalid: article element
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <article>Article content</article>
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('article') }],
    },
    // Invalid: aside element
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <aside>Sidebar</aside>
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('aside') }],
    },
    // Invalid: footer element
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <footer>Footer</footer>
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('footer') }],
    },
    // Invalid: main element
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <main>Main content</main>
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('main') }],
    },
    // Invalid: a (anchor) element
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <a href="/">Home</a>
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('a') }],
    },
    // Invalid: button element
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <button>Click me</button>
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('button') }],
    },
    // Invalid: input element
    {
      code: `
        import Head from "next/head";
        export default function Page() {
          return (
            <Head>
              <input type="text" />
            </Head>
          );
        }
      `,
      errors: [{ message: errorMessage('input') }],
    },
  ],
}

describe('no-invalid-head-children', () => {
  ruleTester.run('eslint', NextESLintRule, tests)
})

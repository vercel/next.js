const rule = require('@next/eslint-plugin-next/lib/rules/missing-preload')
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
ruleTester.run('missing-preload', rule, {
  valid: [
    `import {Head} from 'next/document';
      export class Blah extends Head {
        render() {
          return (
            <div>
              <h1>Hello title</h1>
              <link href="/_next/static/css/styles.css" rel="preload" />
              <link href="/_next/static/css/styles.css" rel="stylesheet" />
            </div>
          );
        }
    }`,
    `import {Head} from 'next/document';
      export class Blah extends Head {
        render() {
          return (
            <div>
              <h1>Hello title</h1>
              <link href="/_next/static/css/styles.css" rel="stylesheet" media="print" />
            </div>
          );
        }
    }`,
    `import {Head} from 'next/head';
      export class Blah {
        render() {
          return (
            <div>
              <div>
                <Head><link href="/_next/static/css/styles.css" rel="preload" /></Head>
              </div>
              <h1>Hello title</h1>
              <Head><link href="/_next/static/css/styles.css" rel="stylesheet" /></Head>
            </div>
          );
        }
    }`,
  ],

  invalid: [
    {
      code: `
        import {Head} from 'next/document';
          export class Blah extends Head {
            render() {
              return (
                <div>
                  <h1>Hello title</h1>
                  <link href="/_next/static/css/styles.css" rel="stylesheet" />
                </div>
              );
            }
        }`,
      errors: [
        {
          message:
            'Stylesheet does not have an associated preload tag. This could potentially impact First paint.',
          type: 'JSXOpeningElement',
        },
      ],
      output: `
        import {Head} from 'next/document';
          export class Blah extends Head {
            render() {
              return (
                <div>
                  <h1>Hello title</h1>
                  <link rel="preload" href="/_next/static/css/styles.css" as="style" /><link href="/_next/static/css/styles.css" rel="stylesheet" />
                </div>
              );
            }
        }`,
    },
    {
      code: `
        <div>
          <link href="/_next/static/css/styles.css" rel="stylesheet" />
        </div>`,
      errors: [
        {
          message:
            'Stylesheet does not have an associated preload tag. This could potentially impact First paint.',
          type: 'JSXOpeningElement',
        },
      ],
      output: `
        <div>
          <link rel="preload" href="/_next/static/css/styles.css" as="style" /><link href="/_next/static/css/styles.css" rel="stylesheet" />
        </div>`,
    },
  ],
})

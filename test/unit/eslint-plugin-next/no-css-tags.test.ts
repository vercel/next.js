import { RuleTester as ESLintTesterV8 } from 'eslint-v8'
import { RuleTester as ESLintTesterV9 } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-css-tags']

const message =
  'Do not include stylesheets manually. See: https://nextjs.org/docs/messages/no-css-tags'

const tests = {
  valid: [
    `import {Head} from 'next/document';

      export class Blah extends Head {
        render() {
          return (
            <div>
              <h1>Hello title</h1>
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
              <link href="https://fonts.googleapis.com/css?family=Open+Sans&display=swap" rel="stylesheet" />
            </div>
          );
        }
    }`,

    `import {Head} from 'next/document';
      export class Blah extends Head {
        render(props) {
          return (
            <div>
              <h1>Hello title</h1>
              <link {...props} />
            </div>
          );
        }
    }`,

    `import {Head} from 'next/document';
      export class Blah extends Head {
        render(props) {
          return (
            <div>
              <h1>Hello title</h1>
              <link rel="stylesheet" {...props} />
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
          message,
          type: 'JSXOpeningElement',
        },
      ],
    },
    {
      code: `
      <div>
        <link href="/_next/static/css/styles.css" rel="stylesheet" />
      </div>`,
      errors: [
        {
          message,
          type: 'JSXOpeningElement',
        },
      ],
    },
  ],
}

describe('no-css-tags', () => {
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

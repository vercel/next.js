import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-sync-scripts']

const message =
  'Synchronous scripts should not be used. See: https://nextjs.org/docs/messages/no-sync-scripts'

const tests = {
  valid: [
    `import {Head} from 'next/document';

      export class Blah extends Head {
        render() {
          return (
            <div>
              <h1>Hello title</h1>
              <script src='https://blah.com' async></script>
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
              <script {...props} ></script>
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
                <script src='https://blah.com'></script>
              </div>
            );
          }
      }`,
      errors: [{ message, type: 'JSXOpeningElement' }],
    },
    {
      code: `
      import {Head} from 'next/document';

        export class Blah extends Head {
          render(props) {
            return (
              <div>
                <h1>Hello title</h1>
                <script src={props.src}></script>
              </div>
            );
          }
      }`,
      errors: [{ message, type: 'JSXOpeningElement' }],
    },
  ],
}

describe('no-sync-scripts', () => {
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

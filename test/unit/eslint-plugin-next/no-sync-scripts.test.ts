import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-sync-scripts']

const message =
  'Synchronous scripts should not be used. See: https://nextjs.org/docs/messages/no-sync-scripts'

const tests = {
  valid: [
    `<script type="module" src="/script.js" />`,
    `<script type="MODULE" src="/script.js" />`,
    `<script type={'module'} src="/script.js" />`,
    `<script {...props} type="module" src={src} />`,
    `<script src="/script.js" defer />`,
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
    ...[
      `<script type="text/javascript" src="/script.js" />`,
      `<script type={'text/javascript'} src="/script.js" />`,
      `<script type={scriptType} src="/script.js" />`,
      `<script type src="/script.js" />`,
      `<script type={null} src="/script.js" />`,
    ].map((code) => ({
      code,
      errors: [{ message, type: 'JSXOpeningElement' }],
    })),
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

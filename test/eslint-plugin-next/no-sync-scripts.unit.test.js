const rule = require('@next/eslint-plugin-next/lib/rules/no-sync-scripts')

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
ruleTester.run('sync-scripts', rule, {
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
      errors: [
        {
          message:
            'External synchronous scripts are forbidden. See: https://nextjs.org/docs/messages/no-sync-scripts.',
          type: 'JSXOpeningElement',
        },
      ],
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
      errors: [
        {
          message:
            'External synchronous scripts are forbidden. See: https://nextjs.org/docs/messages/no-sync-scripts.',
          type: 'JSXOpeningElement',
        },
      ],
    },
  ],
})

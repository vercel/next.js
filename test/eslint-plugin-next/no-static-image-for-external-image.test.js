const rule = require('@next/eslint-plugin-next/lib/rules/no-static-image-for-external-image')

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
ruleTester.run('no-img-element', rule, {
  valid: [
    `import { StaticImage } from 'next/image';

      export class MyComponent {
        render() {
          return (
            <div>
              <StaticImage
                src="/test.png"
              />
            </div>
          );
        }
      }`,
  ],
  invalid: [
    {
      code: `import { StaticImage } from 'next/image';

      export class MyComponent {
        render() {
          return (
            <div>
              <StaticImage
                src="https://test.png"
              />
            </div>
          );
        }
      }`,
      errors: [
        {
          message:
            'Do not use StaticImage for external images that are not stored locally. See https://nextjs.org/docs/messages/no-static-image-for-external.',
          type: 'JSXOpeningElement',
        },
      ],
    },
  ],
})

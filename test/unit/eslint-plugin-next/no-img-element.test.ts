import * as rule from '@next/eslint-plugin-next/dist/rules/no-img-element'
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

ruleTester.run('no-img-element', rule, {
  valid: [
    `import { Image } from 'next/image';

      export class MyComponent {
        render() {
          return (
            <div>
              <Image
                src="/test.png"
                alt="Test picture"
                width={500}
                height={500}
              />
            </div>
          );
        }
      }`,
    `export class MyComponent {
        render() {
          return (
            <picture>
              <img
                src="/test.png"
                alt="Test picture"
                width={500}
                height={500}
              />
            </picture>
          );
        }
      }`,
    `export class MyComponent {
        render() {
          return (
            <div>
              <picture>
                <source media="(min-width:650px)" srcset="/test.jpg"/>
                <img
                  src="/test.png"
                  alt="Test picture"
                  style="width:auto;"
                />
              </picture>
            </div>
          );
        }
      }`,
  ],
  invalid: [
    {
      code: `
      export class MyComponent {
        render() {
          return (
            <div>
              <img
                src="/test.png"
                alt="Test picture"
                width={500}
                height={500}
              />
            </div>
          );
        }
      }`,
      errors: [
        {
          message:
            'Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element',
          type: 'JSXOpeningElement',
        },
      ],
    },
    {
      code: `
      export class MyComponent {
        render() {
          return (
            <img
              src="/test.png"
              alt="Test picture"
              width={500}
              height={500}
            />
          );
        }
      }`,
      errors: [
        {
          message:
            'Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element',
          type: 'JSXOpeningElement',
        },
      ],
    },
  ],
})

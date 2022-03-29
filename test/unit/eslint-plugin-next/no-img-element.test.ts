import rule from '@next/eslint-plugin-next/lib/rules/no-img-element'
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
            "Do not use <img>. Use Image from 'next/image' instead. See: https://nextjs.org/docs/messages/no-img-element",
          type: 'JSXOpeningElement',
        },
      ],
    },
    {
      code: `
      import styled from 'styled-components'
      const StyledImage = styled.img\`\`
      export class MyComponent {
        render() {
          return (
            <div>
              <StyledImage
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
            "Do not use <img>. Use Image from 'next/image' instead. See: https://nextjs.org/docs/messages/no-img-element",
          type: 'MemberExpression',
        },
      ],
    },
    {
      code: `
      import styled from 'styled-components'
      const StyledImage = styled.img.attrs({
        width: 500,
        height: 500,
      })\`\`
      export class MyComponent {
        render() {
          return (
            <div>
              <StyledImage
                src="/test.png"
                alt="Test picture"
              />
            </div>
          );
        }
      }`,
      errors: [
        {
          message:
            "Do not use <img>. Use Image from 'next/image' instead. See: https://nextjs.org/docs/messages/no-img-element",
          type: 'MemberExpression',
        },
      ],
    },
  ],
})

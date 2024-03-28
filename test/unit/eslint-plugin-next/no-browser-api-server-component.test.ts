import rule from '@next/eslint-plugin-next/dist/rules/no-browser-api-server-component'
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

const message = 'Prevent the use of browser APIs in server components.'

const url =
  'https://nextjs.org/docs/messages/no-browser-api-in-server-component'

ruleTester.run('no-browser-api-in-server-component', rule, {
  valid: [
    `
    export default function MyComponent() {
      return <></>
    }
    `,
    `
    export default function MyComponent() {
      useEffect(() => {
        const myWindow = window;
      }, []);

      return <></>
    }
    `,
    `
     'use client';

      export default function MyComponent() {
        const myWindow = window;

        return (
          <div>
            My Client Component
          </div>
        );
      }
    `,
    `
      const functionWithWindow = () => {
        const myWindow = window;
      }
    `,
    `
      const myWindow = window;
    `,
  ],
  invalid: [
    {
      code: `
      export default function MyComponent() {
        const myWindow = window;

        return (
          <div>
            My Component
          </div>
        );
      }
      `,
      errors: [
        {
          message: `${message} Avoid using \`window\` in server components. See: ${url}`,
        },
      ],
    },
    {
      code: `
      export default function MyComponent() {
        const myDocument = document;

        return (
          <>
            My Component
          </>
        );
      }
      `,
      errors: [
        {
          message: `${message} Avoid using \`document\` in server components. See: ${url}`,
        },
      ],
    },
  ],
})

import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-cookies-in-mcp-tools']

const message =
  'Do not call `cookies()` in an MCP tool. It reads whatever browser session accompanies the request, which can be a different identity from the authenticated MCP caller. Use `ctx.session.auth.current` instead. See: https://nextjs.org/docs/messages/no-cookies-in-mcp-tools'

const tests = {
  valid: [
    // A tool that identifies the caller through the tool context.
    `
    import { defineTool } from '@next/mcp/tools'
    import { z } from 'zod'

    export default defineTool({
      description: 'Who am I?',
      inputSchema: z.object({}),
      execute: (_input, ctx) => ctx.session.auth.current?.principalId,
    })
    `,
    // cookies() outside of a tool file is fine.
    `
    import { cookies } from 'next/headers'

    export default async function Page() {
      const theme = (await cookies()).get('theme')
      return theme?.value
    }
    `,
    // Other next/headers APIs are not flagged.
    `
    import { defineTool } from '@next/mcp/tools'
    import { headers } from 'next/headers'

    export default defineTool({
      description: 'User agent',
      inputSchema: {},
      execute: async () => (await headers()).get('user-agent'),
    })
    `,
    // A local function that happens to be called cookies.
    `
    import { defineTool } from '@next/mcp/tools'
    const cookies = () => ['chocolate chip']

    export default defineTool({
      description: 'List cookies',
      inputSchema: {},
      execute: () => cookies(),
    })
    `,
  ],
  invalid: [
    {
      code: `
      import { defineTool } from '@next/mcp/tools'
      import { cookies } from 'next/headers'

      export default defineTool({
        description: 'Read the session',
        inputSchema: {},
        async execute() {
          return (await cookies()).get('session')?.value
        },
      })
      `,
      errors: [{ message, type: 'CallExpression' }],
    },
    {
      code: `
      import { cookies as readCookies } from 'next/headers'
      import { defineTool } from '@next/mcp/tools'

      export default defineTool({
        description: 'Read the session',
        inputSchema: {},
        execute: async () => (await readCookies()).getAll(),
      })
      `,
      errors: [{ message, type: 'CallExpression' }],
    },
    {
      code: `
      import * as nextHeaders from 'next/headers'
      import { defineTool } from '@next/mcp/tools'

      export default defineTool({
        description: 'Read the session',
        inputSchema: {},
        execute: async () => (await nextHeaders.cookies()).getAll(),
      })
      `,
      errors: [{ message, type: 'CallExpression' }],
    },
  ],
}

describe('no-cookies-in-mcp-tools', () => {
  new RuleTester({
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  }).run('eslint', NextESLintRule, tests)
})

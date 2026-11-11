import { RuleTester } from 'eslint'
import * as tsParser from '@typescript-eslint/parser'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-top-level-await-in-mcp']

const url = 'https://nextjs.org/docs/messages/no-top-level-await-in-mcp'
const toolMessage = `Top-level \`await\` in an MCP tool module runs on every cold start of the MCP route and during \`next build\`. Move it into \`execute()\`, or cache it lazily on first use. See: ${url}`
const routeMessage = `Top-level \`await\` in an MCP route module runs on every cold start of the MCP route and during \`next build\`. Move it into the auth function or tool that needs it, or cache it lazily on first use. See: ${url}`

const tool = `import { defineTool } from '@next/mcp/tools'
import { z } from 'zod'
`
const route = `import { mcpRoute } from '@next/mcp'
`

const tests = {
  valid: [
    // await inside execute.
    `${tool}export default defineTool({ description: 'x', inputSchema: z.object({}), async execute() { await fetch('https://example.com') } })`,
    // await inside an auth function in a route module.
    `${route}const auth = async (request) => { await request.text(); return null }
export const { GET, POST, DELETE } = mcpRoute({ name: 'a', version: '1', auth, tools: {} })`,
    // Ordinary modules are out of scope.
    `const config = await fetch('https://example.com')
export default config`,
  ],
  invalid: [
    {
      code: `${tool}const config = await fetch('https://config.example.com')
export default defineTool({ description: 'x', inputSchema: z.object({}), async execute() { return config } })`,
      errors: [{ message: toolMessage, type: 'AwaitExpression' }],
    },
    {
      code: `${route}const keys = await loadKeys()
export const { GET, POST, DELETE } = mcpRoute({ name: 'a', version: '1', auth: () => keys, tools: {} })`,
      errors: [{ message: routeMessage, type: 'AwaitExpression' }],
    },
    {
      code: `${tool}for await (const chunk of stream()) {}
export default defineTool({ description: 'x', inputSchema: z.object({}), async execute() {} })`,
      errors: [{ message: toolMessage, type: 'ForOfStatement' }],
    },
  ],
}

describe('no-top-level-await-in-mcp', () => {
  new RuleTester({
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  }).run('eslint', NextESLintRule, tests)

  new RuleTester({
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  }).run('typescript', NextESLintRule, {
    valid: [],
    invalid: [
      // A tool wrapped in `satisfies` is still a tool.
      {
        code: `${tool}const config = await fetch('https://config.example.com')
export default defineTool({ description: 'x', inputSchema: z.object({}), async execute() { return config } }) satisfies unknown`,
        errors: [{ message: toolMessage, type: 'AwaitExpression' }],
      },
    ],
  })
})

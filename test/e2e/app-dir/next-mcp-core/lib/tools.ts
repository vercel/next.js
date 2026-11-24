import { defineTool } from '@next/mcp/tools'

const inputSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
}
const outputSchema = {
  type: 'object',
  properties: { value: { type: 'integer' } },
  required: ['value'],
}
const jsonSchema = {
  input: () => outputSchema,
  output: () => outputSchema,
}

export const tools = {
  valid_output: defineTool({
    description: 'Return output matching a plain JSON Schema.',
    inputSchema,
    outputSchema,
    execute: () => ({ value: 42 }),
  }),
  invalid_output: defineTool({
    description: 'Return output that does not match its schema.',
    inputSchema,
    outputSchema,
    execute: () => ({ value: 'not an integer' }),
  }),
  throwing_validator: defineTool({
    description: 'Throw while validating output.',
    inputSchema,
    outputSchema: {
      '~standard': {
        version: 1,
        vendor: 'next-mcp-core',
        jsonSchema,
        validate() {
          throw new Error('next-mcp-core private validator detail')
        },
      },
    },
    execute: () => ({ value: 42 }),
  }),
  async_invalid_output: defineTool({
    description: 'Reject output with an asynchronous validator.',
    inputSchema,
    outputSchema: {
      '~standard': {
        version: 1,
        vendor: 'next-mcp-core',
        jsonSchema,
        async validate() {
          return {
            issues: [{ message: 'next-mcp-core private validation issue' }],
          }
        },
      },
    },
    execute: () => ({ value: 42 }),
  }),
  denied: defineTool({
    description: 'Deny approval before executing.',
    inputSchema,
    outputSchema,
    approval: () => 'denied',
    execute() {
      throw new Error('next-mcp-core denied tool must not execute')
    },
  }),
  final_yield: defineTool({
    description: 'Return only the final yielded value.',
    inputSchema,
    async *execute() {
      yield 'first yield'
      yield 'last yield'
      return 'ignored generator return'
    },
  }),
}

import { defineTool } from '@next/mcp/tools'
import { z } from 'zod'

export default defineTool({
  description: 'Needs approval; never runs over MCP.',
  inputSchema: z.object({ really: z.boolean() }),
  approval: ({ toolInput }) =>
    toolInput?.really
      ? 'user-approval'
      : { type: 'denied', reason: 'Not really.' },
  execute() {
    console.log('[next-mcp] delete_all executed')
    throw new Error('should not run')
  },
})

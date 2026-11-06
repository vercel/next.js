import { defineTool } from '@next/mcp/tools'
import { z } from 'zod'

export default defineTool({
  description: 'Always throws an error with a secret in the message.',
  inputSchema: z.object({}),
  execute() {
    throw new Error('db password is hunter2')
  },
})

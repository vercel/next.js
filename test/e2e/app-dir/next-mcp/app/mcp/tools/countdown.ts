import { defineTool } from '@next/mcp/tools'
import { z } from 'zod'

export default defineTool({
  description: 'Counts down; only the final yield is returned.',
  inputSchema: z.object({ from: z.number().int().min(1).max(5) }),
  async *execute({ from }) {
    for (let i = from; i >= 0; i--) yield `t-${i}`
  },
})

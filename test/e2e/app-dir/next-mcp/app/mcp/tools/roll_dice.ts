import { defineTool } from '@next/mcp/tools'
import { z } from 'zod'

export default defineTool({
  description: 'Roll an N-sided die.',
  inputSchema: z.object({ sides: z.number().int().min(2).max(1000) }),
  outputSchema: z.object({ value: z.number().int() }),
  execute: ({ sides }) => ({ value: 1 + Math.floor(Math.random() * sides) }),
})

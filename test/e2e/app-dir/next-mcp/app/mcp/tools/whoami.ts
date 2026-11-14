import { defineTool } from '@next/mcp/tools'
import { after } from 'next/server'
import { z } from 'zod'

export default defineTool({
  description: 'Report the caller identity and call metadata.',
  inputSchema: z.object({}),
  label: { start: () => 'Who am I' }, // eve-only, ignored
  execute(_input, ctx) {
    after(() => console.log('[next-mcp] after() ran for call', ctx.callId))
    return {
      principal: ctx.session.auth.current,
      callId: ctx.callId,
      toolName: ctx.toolName,
    }
  },
})

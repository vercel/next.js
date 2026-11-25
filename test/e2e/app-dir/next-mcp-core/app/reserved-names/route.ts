import { mcpRoute, toolsFromGlob } from '@next/mcp'
import { none } from '@next/mcp/auth'
import { defineTool } from '@next/mcp/tools'

export function GET() {
  const tool = defineTool({
    description: 'A tool with an SDK-reserved name.',
    inputSchema: { type: 'object' },
    execute: () => 'unused',
  })
  const tools = toolsFromGlob({
    './tools/__proto__.ts': { default: tool },
    './tools/constructor.ts': { default: tool },
    './tools/toString.ts': { default: tool },
  })
  const names = Object.keys(tools)
  const errors = names.map((name) => {
    try {
      mcpRoute({
        name: 'next-mcp-core-reserved-name',
        version: '0.1.0',
        url: 'http://localhost/reserved-names',
        auth: none(),
        tools: { [name]: tools[name] },
      })
      return null
    } catch (error) {
      if (!(error instanceof Error)) throw error
      return error.message
    }
  })
  return Response.json({ names, errors })
}

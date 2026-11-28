import { mcpRoute } from '@next/mcp'
import { none } from '@next/mcp/auth'
import { tools } from '../../lib/tools'

export const { GET, POST, DELETE } = mcpRoute({
  name: 'next-mcp-core',
  version: '0.1.0',
  url: process.env.VERCEL ? undefined : 'http://localhost/mcp',
  auth: none(),
  tools,
})

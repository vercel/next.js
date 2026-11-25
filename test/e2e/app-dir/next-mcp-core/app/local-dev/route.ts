import { mcpRoute } from '@next/mcp'
import { localDev } from '@next/mcp/auth'

export const { GET, POST, DELETE } = mcpRoute({
  name: 'next-mcp-core-local-dev',
  version: '0.1.0',
  url: process.env.VERCEL ? undefined : 'http://localhost/local-dev',
  auth: localDev(),
  tools: {},
})

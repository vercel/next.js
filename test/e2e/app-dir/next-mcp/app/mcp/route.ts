import { mcpRoute, toolsFromGlob } from '@next/mcp'
import { localDev } from '@next/mcp/auth'
import { testToken } from '../../lib/test-auth'

export const { GET, POST, DELETE } = mcpRoute({
  name: 'next-mcp-e2e',
  version: '0.1.0',
  instructions: 'A test server.',
  url: 'http://localhost/mcp',
  auth: [testToken(), localDev()],
  tools: toolsFromGlob(import.meta.glob('./tools/*.ts', { eager: true })),
})

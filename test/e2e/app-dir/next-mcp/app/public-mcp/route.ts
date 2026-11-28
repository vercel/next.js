import { mcpRoute } from '@next/mcp'
import { none } from '@next/mcp/auth'
import countdown from '../mcp/tools/countdown'
import roll_dice from '../mcp/tools/roll_dice'
import whoami from '../mcp/tools/whoami'

export const { GET, POST, DELETE } = mcpRoute({
  name: 'next-mcp-e2e-public',
  version: '0.1.0',
  url: 'http://localhost/public-mcp',
  auth: none(),
  tools: { countdown, roll_dice, whoami },
})

import path from 'node:path'
import { mcpRoute } from '@next/mcp'
import { none } from '@next/mcp/auth'
import { skillsFromDirectory } from '@next/mcp/skills'

// roll-dice's SKILL.md is over 200 bytes, so only release-notes is served.
export const { GET, POST, DELETE } = mcpRoute({
  name: 'next-mcp-e2e-small-skills',
  version: '0.1.0',
  url: 'http://localhost/small-skills-mcp',
  auth: none(),
  tools: {},
  skills: skillsFromDirectory(path.join(process.cwd(), 'skills'), {
    maxFileSize: 200,
  }),
})

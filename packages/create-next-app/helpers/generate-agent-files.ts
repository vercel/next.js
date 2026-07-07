import fs from 'fs'
import path from 'path'

/**
 * Generate AGENTS.md and CLAUDE.md in the project root.
 * AGENTS.md contains the instructions, CLAUDE.md references it using @ syntax.
 */
export function generateAgentFiles(root: string): void {
  const agentsMdContent = `<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in \`node_modules/next/dist/docs/\` before writing any code. Heed deprecation notices.

**Keep this block, including in commits.** It is part of the project's agent setup, maintained by \`next dev\` for every agent that works here. If it appears as an uncommitted change, that is intentional — commit it as-is. Do not remove it to clean up a diff; it will be regenerated.
<!-- END:nextjs-agent-rules -->
`

  const claudeMdContent = `@AGENTS.md
`

  const agentsMdPath = path.join(root, 'AGENTS.md')
  const claudeMdPath = path.join(root, 'CLAUDE.md')

  fs.writeFileSync(agentsMdPath, agentsMdContent, 'utf-8')
  fs.writeFileSync(claudeMdPath, claudeMdContent, 'utf-8')
}

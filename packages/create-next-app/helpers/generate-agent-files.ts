import fs from 'fs'
import path from 'path'

/**
 * Generate AGENTS.md and CLAUDE.md in the project root.
 * AGENTS.md contains the instructions, CLAUDE.md references it using @ syntax.
 */
export function generateAgentFiles(root: string): void {
  const agentsMdContent = `<!-- BEGIN:nextjs-agent-rules -->
# ALWAYS read docs before coding

React and Next.js patterns have changed significantly. Your training data may be outdated. Read the relevant guide in \`node_modules/next/dist/docs/\` before writing any code.
<!-- END:nextjs-agent-rules -->
`

  const claudeMdContent = `@AGENTS.md
`

  const agentsMdPath = path.join(root, 'AGENTS.md')
  const claudeMdPath = path.join(root, 'CLAUDE.md')

  fs.writeFileSync(agentsMdPath, agentsMdContent, 'utf-8')
  fs.writeFileSync(claudeMdPath, claudeMdContent, 'utf-8')
}

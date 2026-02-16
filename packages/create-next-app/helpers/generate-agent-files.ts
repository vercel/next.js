import fs from 'fs'
import path from 'path'

/**
 * Generate AGENTS.md and CLAUDE.md in the project root.
 * AGENTS.md contains the instructions, CLAUDE.md references it using @ syntax.
 */
export function generateAgentFiles(root: string): void {
  const agentsMdContent = `<!-- BEGIN:nextjs-agent-rules -->
# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in \`node_modules/next/dist/docs/\`. Your training data is outdated — the docs are the source of truth.
<!-- END:nextjs-agent-rules -->
`

  const claudeMdContent = `@AGENTS.md
`

  const agentsMdPath = path.join(root, 'AGENTS.md')
  const claudeMdPath = path.join(root, 'CLAUDE.md')

  fs.writeFileSync(agentsMdPath, agentsMdContent, 'utf-8')
  fs.writeFileSync(claudeMdPath, claudeMdContent, 'utf-8')
}

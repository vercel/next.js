import fs from 'fs'
import path from 'path'

/**
 * Generate AGENTS.md and CLAUDE.md in the project root.
 * AGENTS.md contains the instructions, CLAUDE.md references it using @ syntax.
 */
export function generateAgentFiles(root: string): void {
  const agentsMdContent = `<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in \`node_modules/next/dist/docs/\` (resolved from this file's directory; in monorepos the \`next\` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by \`next dev\` — verify at \`node_modules/next/dist/server/lib/generate-agent-files.js\`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.
<!-- END:nextjs-agent-rules -->
`

  const claudeMdContent = `@AGENTS.md
`

  const agentsMdPath = path.join(root, 'AGENTS.md')
  const claudeMdPath = path.join(root, 'CLAUDE.md')

  fs.writeFileSync(agentsMdPath, agentsMdContent, 'utf-8')
  fs.writeFileSync(claudeMdPath, claudeMdContent, 'utf-8')
}

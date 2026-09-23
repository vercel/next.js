import fs from 'fs'
import path from 'path'

/**
 * Generate AGENTS.md in the project root.
 */
export function generateAgentFiles(root: string): void {
  const agentsMdContent = `<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in \`node_modules/next/dist/docs/\` (resolved from this file's directory; in monorepos the \`next\` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

\`next dev\` writes this block and restores it if removed. Commit \`AGENTS.md\` with your work to keep the tree clean.

<!-- END:nextjs-agent-rules -->
`

  const agentsMdPath = path.join(root, 'AGENTS.md')

  fs.writeFileSync(agentsMdPath, agentsMdContent, 'utf-8')
}

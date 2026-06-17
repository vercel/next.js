const { existsSync } = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const { execSync } = require('child_process')

const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

/**
 * Check if the Next.js build is fresh (matches current git HEAD).
 * Prints warnings to console if build is missing or stale.
 * @returns {Promise<void>}
 */
async function checkBuildFreshness() {
  const distPath = path.join(__dirname, '../../packages/next/dist')
  const buildCommitPath = path.join(distPath, '.build-commit')

  if (!existsSync(distPath)) {
    console.warn(`${YELLOW}⚠️  WARNING: No build found!${RESET}`)
    console.warn(
      `${YELLOW}   The packages/next/dist directory does not exist.${RESET}`
    )
    console.warn(
      `${YELLOW}   Run \`pnpm build\` before running tests.\n${RESET}`
    )
    return
  }

  if (!existsSync(buildCommitPath)) {
    console.warn(`${YELLOW}⚠️  WARNING: Build may be stale!${RESET}`)
    console.warn(
      `${YELLOW}   Unable to verify build freshness (no .build-commit marker).${RESET}`
    )
    console.warn(`${YELLOW}   Run \`pnpm build\` to rebuild.\n${RESET}`)
    return
  }

  try {
    const buildCommit = (await fsp.readFile(buildCommitPath, 'utf8')).trim()
    const currentCommit = execSync('git rev-parse HEAD', {
      encoding: 'utf8',
    }).trim()

    if (buildCommit !== currentCommit) {
      console.warn(`${YELLOW}⚠️  WARNING: Build is stale!${RESET}`)
      console.warn(
        `${YELLOW}   Build was compiled at commit: ${buildCommit.slice(0, 8)}${RESET}`
      )
      console.warn(
        `${YELLOW}   Current HEAD is at commit:    ${currentCommit.slice(0, 8)}${RESET}`
      )
      console.warn(`${YELLOW}   Run \`pnpm build\` to rebuild.\n${RESET}`)
    }
  } catch (err) {
    // Ignore errors (e.g., git not available)
  }
}

module.exports = { checkBuildFreshness }

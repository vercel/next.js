const PNPM_HOISTED_CONFIG = `# Work around the Node.js realpath bug fixed in 24.21.0 and 26.8.0.
# https://github.com/nodejs/node/pull/65113
node-linker=hoisted
`

function hasNodeRealpathFix(nodeVersion: string): boolean {
  const [major, minor] = nodeVersion.split('.').map(Number)
  return (
    (major === 24 && minor >= 21) || major > 26 || (major === 26 && minor >= 8)
  )
}

export function getPnpmRealpathWorkaround(
  nodeVersion = process.versions.node
): Record<string, string> | undefined {
  if (hasNodeRealpathFix(nodeVersion)) {
    return undefined
  }
  return { '.npmrc': PNPM_HOISTED_CONFIG }
}

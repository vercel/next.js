import { execSync } from 'child_process'

function detectByAgentOrCommand(name: string, aliasCommand: string) {
  try {
    const userAgent = process.env.npm_config_user_agent
    if (userAgent) {
      return Boolean(userAgent && userAgent.startsWith(name))
    }
    execSync(aliasCommand, { stdio: 'ignore' })
    return true
  } catch (e) {
    return false
  }
}
function shouldUseYarn(): boolean {
  return detectByAgentOrCommand('yarn', 'yarnpkg --version')
}

function shouldUsePnpm(): boolean {
  return detectByAgentOrCommand('pnpm', 'pnpm --version')
}

export function getPackageManager(): 'npm' | 'yarn' | 'pnpm' {
  return shouldUseYarn() ? 'yarn' : shouldUsePnpm() ? 'pnpm' : 'npm'
}

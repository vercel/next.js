import { execSync } from 'child_process'
import fs from 'fs'

export function shouldUseYarn(): boolean {
  try {
    const userAgent = process.env.npm_config_user_agent
    if (userAgent) {
      return Boolean(userAgent && userAgent.startsWith('yarn'))
    } else {
      if (fs.existsSync('yarn.lock')) {
        return true
      } else if (fs.existsSync('package-lock.json')) {
        return false
      }
      execSync('yarnpkg --version', { stdio: 'ignore' })
      return true
    }
  } catch (e) {
    return false
  }
}

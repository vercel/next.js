import { execSync } from 'child_process'

export function shouldUseYarn(): boolean {
  try {
    execSync('yarnpkg --version', { stdio: 'ignore' })
    return true
  } catch (e) {
    return false
  }
}

import fs from 'fs'

export function isDocker(): boolean {
  try {
    return (
      fs.existsSync('/.dockerenv') ||
      fs.readFileSync('/proc/self/cgroup', 'utf8').includes('docker')
    )
  } catch {
    return false
  }
}

import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { NEXT_LOCK_FILE } from '../next-server/lib/constants'

export default function checkPidFile(distDir: string) {
  let pid: string | undefined
  const pidFile = join(distDir, NEXT_LOCK_FILE)

  try {
    pid = readFileSync(pidFile, 'utf8')
  } catch (_) {}

  if (pid) {
    let pidExists = false
    try {
      // signal zero checks if the process exists, throws if it doesn't
      process.kill(parseInt(pid, 10), 0)
      pidExists = true
    } catch (err) {
      // if it's a permission error that means it does exist
      pidExists = err.code === 'EPERM'
    }

    if (pidExists) {
      throw new Error(
        `A Next.js process is already active in this folder under process id ${pid}\n` +
          `This can cause unintended side-effects, please stop the other process before starting a new one.`
      )
    }
  }

  // write current pid to lock file
  try {
    mkdirSync(distDir)
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
  }
  writeFileSync(pidFile, process.pid + '')
}

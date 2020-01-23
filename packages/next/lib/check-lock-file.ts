import lock from 'proper-lockfile'
import { mkdirSync } from 'fs'

export default function checkLockFile(distDir: string) {
  try {
    mkdirSync(distDir)
  } catch (_) {}

  const locked = lock.checkSync(distDir)

  if (locked) {
    throw new Error(
      `A Next.js process is already active in this folder\n` +
        `This can cause unintended side-effects, please stop the other process before starting a new one.`
    )
  }

  lock.lockSync(distDir)
}

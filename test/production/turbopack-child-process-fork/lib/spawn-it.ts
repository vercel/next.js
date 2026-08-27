import { fork } from 'node:child_process'
import path from 'node:path'

export function spawnWorker() {
  const script = path.join(process.cwd(), 'worker.mjs')
  return fork(script, [])
}

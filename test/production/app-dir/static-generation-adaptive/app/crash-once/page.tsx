import fs from 'node:fs'
import path from 'node:path'
import { isMainThread } from 'node:worker_threads'

export default function Page() {
  // Kill the build worker the first time this page renders. The adaptive
  // scheduler should restart the worker and retry the page on its own.
  // process.exit only exits the current thread; SIGKILL would kill its parent.
  const marker = path.join(process.cwd(), '.crash-once-marker')
  if (!fs.existsSync(marker)) {
    fs.writeFileSync(marker, 'crashed')
    fs.writeSync(1, 'adaptive crash-once stdout\n')
    fs.writeSync(2, 'adaptive crash-once stderr\n')
    if (isMainThread) {
      process.kill(process.pid, 'SIGKILL')
    } else {
      process.exit(75)
    }
  }
  return <p id="crash-once">survived</p>
}

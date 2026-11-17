import fs from 'node:fs'
import path from 'node:path'
import { isMainThread } from 'node:worker_threads'

export default function Page() {
  // Kill the build worker the first time this page renders. The adaptive
  // scheduler should restart the worker and retry the page on its own. In
  // worker thread mode a SIGKILL would take down the whole build process, so
  // only crash when running in a child process.
  const marker = path.join(process.cwd(), '.crash-once-marker')
  if (isMainThread && !fs.existsSync(marker)) {
    fs.writeFileSync(marker, 'crashed')
    process.kill(process.pid, 'SIGKILL')
  }
  return <p id="crash-once">survived</p>
}

import { writeSync } from 'node:fs'
import { isMainThread } from 'node:worker_threads'

export default function Page() {
  // Flush both streams before the process is killed, including after retries.
  writeSync(1, 'worker-kill page stdout\n')
  writeSync(2, 'worker-kill page stderr\n')
  if (isMainThread) {
    process.kill(process.pid, 'SIGKILL')
  } else {
    // Exit this thread without killing the build process that hosts it.
    process.exit(75)
  }

  return <div>Kaboom</div>
}

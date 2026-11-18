import { writeSync } from 'node:fs'

export default function Page() {
  // Flush both streams before the process is killed, including after retries.
  writeSync(1, 'worker-kill page stdout\n')
  writeSync(2, 'worker-kill page stderr\n')
  process.kill(process.pid, 'SIGKILL')

  return <div>Kaboom</div>
}

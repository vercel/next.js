import { rm as rmPromises } from 'fs/promises'
import { rm as rmCallback, rmSync } from 'fs'
import { promisify } from 'util'

const rmCallbackPromise = promisify(rmCallback)

const targetDir = process.argv[2]
const method = process.argv[3] // 'promises', 'callback', or 'sync'

async function test() {
  const time = process.hrtime()

  if (method === 'promises') {
    await rmPromises(targetDir, { recursive: true, force: true })
  } else if (method === 'callback') {
    await rmCallbackPromise(targetDir, { recursive: true, force: true })
  } else if (method === 'sync') {
    rmSync(targetDir, { recursive: true, force: true })
  }

  const hrtime = process.hrtime(time)
  const nanoseconds = hrtime[0] * 1e9 + hrtime[1]
  const milliseconds = nanoseconds / 1e6
  console.log(milliseconds)
}

test()

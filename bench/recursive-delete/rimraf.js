import { manual, manualSync } from 'rimraf'

const targetDir = process.argv[2]
const method = process.argv[3]

async function test() {
  const time = process.hrtime()

  if (method === 'sync') {
    manualSync(targetDir)
  } else {
    await manual(targetDir)
  }

  const hrtime = process.hrtime(time)
  const nanoseconds = hrtime[0] * 1e9 + hrtime[1]
  const milliseconds = nanoseconds / 1e6
  console.log(milliseconds)
}

test()

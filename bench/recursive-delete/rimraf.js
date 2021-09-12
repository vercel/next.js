import { join } from 'path'
import { promisify } from 'util'
import rimrafMod from 'rimraf'

const rimraf = promisify(rimrafMod)
const resolveDataDir = join(__dirname, `fixtures-${process.argv[2]}`, '**/*')

async function test() {
  const time = process.hrtime()
  await rimraf(resolveDataDir)

  const hrtime = process.hrtime(time)
  const nanoseconds = hrtime[0] * 1e9 + hrtime[1]
  const milliseconds = nanoseconds / 1e6
  console.log(milliseconds)
}

test()

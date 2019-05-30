const { join } = require('path')
const { promisify } = require('util')
const globMod = require('glob')
const glob = promisify(globMod)
const resolveDataDir = join(__dirname, 'fixtures', '**/*')

async function test () {
  const time = process.hrtime()
  await glob(resolveDataDir)

  const hrtime = process.hrtime(time)
  const nanoseconds = hrtime[0] * 1e9 + hrtime[1]
  const milliseconds = nanoseconds / 1e6
  console.log(milliseconds)
}

async function run () {
  for (let i = 0; i < 50; i++) {
    await test()
  }
}

run()

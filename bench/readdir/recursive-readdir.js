const { join } = require('path')
const { recursiveFilter } = require('next/dist/lib/recursive-helpers')
const resolveDataDir = join(__dirname, 'fixtures')

async function test () {
  const time = process.hrtime()
  await recursiveFilter(resolveDataDir, { files: /\.js$/ })

  const hrtime = process.hrtime(time)
  const nanoseconds = (hrtime[0] * 1e9) + hrtime[1]
  const milliseconds = nanoseconds / 1e6
  console.log(milliseconds)
}

async function run () {
  for (let i = 0; i < 50; i++) {
    await test()
  }
}

run()

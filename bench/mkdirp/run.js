const { join } = require('path')
const { promisify } = require('util')
const fs = require('fs-extra')

const mkdirpNpm = promisify(require('mkdirp'))
const mkdirpSyncNpm = require('mkdirp').sync

const {
  mkdirp: mkdirpCustom,
  mkdirpSync: mkdirpSyncCustom
} = require('next/dist/lib/mkdirp')

const fixturesDir = join(__dirname, 'fixtures')

let i = 0
const createDeepDir = () => {
  i++
  return join(fixturesDir, `f${i}`, 'one', 'two', 'three', 'four')
}

async function run (fn) {
  async function test (dir) {
    const start = process.hrtime()

    await fn(dir)

    const timer = process.hrtime(start)
    const ms = (timer[0] * 1e9 + timer[1]) / 1e6
    return ms
  }

  const ts = []

  for (let i = 0; i < 100; i++) {
    const t = await test(createDeepDir())
    ts.push(t)
  }

  const sum = ts.reduce((a, b) => a + b)
  const nb = ts.length
  const avg = sum / nb
  console.log({ sum, nb, avg })
}

async function main () {
  console.log('test mkdirp npm module')
  await run(mkdirpNpm)

  console.log('test mkdirp custom implementation')
  await run(mkdirpCustom)

  console.log('test mkdirp sync npm module')
  await run(mkdirpSyncNpm)

  console.log('test mkdirp sync custom implementation')
  await run(mkdirpSyncCustom)

  await fs.remove(fixturesDir)
}

main()

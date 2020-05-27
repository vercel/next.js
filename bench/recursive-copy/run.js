const { join } = require('path')
const fs = require('fs-extra')

const recursiveCopyNpm = require('recursive-copy')

const {
  recursiveCopy: recursiveCopyCustom,
} = require('next/dist/lib/recursive-copy')

const fixturesDir = join(__dirname, 'fixtures')
const srcDir = join(fixturesDir, 'src')
const destDir = join(fixturesDir, 'dest')

const createSrcFolder = async () => {
  await fs.ensureDir(srcDir)

  const files = new Array(100)
    .fill(undefined)
    .map((x, i) =>
      join(srcDir, `folder${i % 5}`, `folder${i + (1 % 5)}`, `file${i}`)
    )

  await Promise.all(files.map((file) => fs.outputFile(file, 'hello')))
}

async function run(fn) {
  async function test() {
    const start = process.hrtime()

    await fn(srcDir, destDir)

    const timer = process.hrtime(start)
    const ms = (timer[0] * 1e9 + timer[1]) / 1e6
    return ms
  }

  const ts = []

  for (let i = 0; i < 10; i++) {
    const t = await test()
    await fs.remove(destDir)
    ts.push(t)
  }

  const sum = ts.reduce((a, b) => a + b)
  const nb = ts.length
  const avg = sum / nb
  console.log({ sum, nb, avg })
}

async function main() {
  await createSrcFolder()

  console.log('test recursive-copy npm module')
  await run(recursiveCopyNpm)

  console.log('test recursive-copy custom implementation')
  await run(recursiveCopyCustom)

  await fs.remove(fixturesDir)
}

main()

import { join } from 'path'
import { ensureDir, outputFile, remove } from 'fs-extra'
import recursiveCopyNpm from 'recursive-copy'
import { recursiveCopy as recursiveCopyCustom } from 'next/dist/lib/recursive-copy'

const fixturesDir = join(__dirname, 'fixtures')
const srcDir = join(fixturesDir, 'src')
const destDir = join(fixturesDir, 'dest')

const createSrcFolder = async () => {
  await ensureDir(srcDir)

  const files = new Array(100)
    .fill(undefined)
    .map((_, i) =>
      join(srcDir, `folder${i % 5}`, `folder${i + (1 % 5)}`, `file${i}`)
    )

  await Promise.all(files.map((file) => outputFile(file, 'hello')))
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
    await remove(destDir)
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

  await remove(fixturesDir)
}

main()

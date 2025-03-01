/* global jest */
jest.autoMockOff()
const Runner = require('jscodeshift/dist/Runner');
const { cp, mkdir, mkdtemp, rm, readdir, readFile, stat } = require('fs/promises')
const { readdirSync } = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')

const fixtureDir = join(__dirname, '..', '__testfixtures__', 'next-image-experimental-loader')
const transform = join(__dirname, '..', 'next-image-experimental.js')
const opts = { recursive: true, force: true }

async function toObj(dir) {
  const obj = {}
  const files = await readdir(dir)
  for (const file of files) {
    const filePath = join(dir, file)
    const s = await stat(filePath)
    if (s.isDirectory()) {
      obj[file] = await toObj(filePath)
    } else {
      obj[file] = await readFile(filePath, 'utf8')
    }
  }
  return obj
}

// TODO: this is not working before it's built, re-enable on CI after migrating tests to defineTest
const loaders = readdirSync(fixtureDir)
for (const loader of loaders) {
  it.skip(`should transform loader ${loader}`, async () => {
    const tmp = await mkdtemp(join(tmpdir(), `next-image-experimental-${loader}-`))
    const originalCwd = process.cwd()
    try {
      await mkdir(tmp, opts)
      await cp(join(fixtureDir, loader, 'input'), tmp, opts)
      process.chdir(tmp)
      const result = await Runner.run(transform, [`.`], {})
      expect(result.error).toBe(0)
      expect(
        await toObj(tmp)
      ).toStrictEqual(
        await toObj(join(fixtureDir, loader, 'output'))
      )
    } finally {
      await rm(tmp, opts)
      process.chdir(originalCwd)
    }
  })
}

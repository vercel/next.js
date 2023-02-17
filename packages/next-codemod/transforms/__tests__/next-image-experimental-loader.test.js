/* global jest */
jest.autoMockOff()
const Runner = require('jscodeshift/dist/Runner');
const { cp, mkdir, rm, readdir, readFile } = require('fs/promises')
const { mkdtempSync, readdirSync } = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')

const fixtureDir = join(__dirname, '..', '__testfixtures__', 'next-image-experimental-loader')
const transform = join(__dirname, '..', 'next-image-experimental.js')
const opts = { recursive: true, force: true }

async function toObj(dir) {
  const obj = {}
  const files = await readdir(dir)
  for (const file of files) {
    obj[file] = await readFile(join(dir, file), 'utf8')
  }
  return obj
}

it.each(readdirSync(fixtureDir))('should transform loader %s', async (loader) => {
  const tmp = mkdtempSync(join(tmpdir(), `next-image-experimental-${loader}-`))
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
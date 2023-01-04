/* global jest */
jest.autoMockOff()
const Runner = require('jscodeshift/dist/Runner');
const { cp, mkdir, rm, readdir, readFile } = require('fs/promises')
const { join } = require('path')

const fixtureDir = join(__dirname, '..', '__testfixtures__', 'next-image-experimental-loader')
const transform = join(__dirname, '..', 'next-image-experimental.js')
const opts = { recursive: true }

async function toObj(dir) {
  const obj = {}
  const files = await readdir(dir)
  for (const file of files) {
    obj[file] = await readFile(join(dir, file), 'utf8')
  }
  return obj
}
it.each(['imgix', 'cloudinary', 'akamai'])('should transform loader %s', async (loader) => {
  try {
    await mkdir(join(fixtureDir, 'tmp'), opts)
    await cp(join(fixtureDir, loader, 'input'), join(fixtureDir, 'tmp'), opts)
    process.chdir(join(fixtureDir, 'tmp'))
    const result = await Runner.run(transform, [`.`], {})
    expect(result.error).toBe(0)
    expect(
      await toObj(join(fixtureDir, 'tmp'))
    ).toStrictEqual(
      await toObj(join(fixtureDir, loader, 'output'))
    )
  } finally {
    await rm(join(fixtureDir, 'tmp'), opts)
  }
})
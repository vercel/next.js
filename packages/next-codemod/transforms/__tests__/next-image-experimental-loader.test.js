/* global jest */
jest.autoMockOff()
const Runner = require('jscodeshift/dist/Runner');
const { cp, mkdir, rm, readdir, readFile } = require('fs/promises')
const { join } = require('path')

const fixtureDir = join(__dirname, '..', '__testfixtures__', 'next-image-experimental-loader')
const transform = join(__dirname, '..', 'next-image-experimental.js')
const opts = { recursive: true }

async function serializeDir(dir) {
  const obj = {}
  const files = await readdir(dir)
  for (const file of files) {
    obj[file] = await readFile(join(dir, file), 'utf8')
  }
  return obj
}

it('should work with imgix', async () => {
  try {
    await mkdir(join(fixtureDir, 'dir-under-test'), opts)
    await cp(join(fixtureDir, 'imgix-input'), join(fixtureDir, 'dir-under-test'), opts)
    process.chdir(join(fixtureDir, 'dir-under-test'))
    const result = await Runner.run(transform, [`.`], {})
    expect(result.error).toBe(0)
    expect(
      await serializeDir(join(fixtureDir, 'dir-under-test'))
    ).toStrictEqual(
      await serializeDir(join(fixtureDir, 'imgix-output'))
    )
  } finally {
    await rm(join(fixtureDir, 'dir-under-test'), opts)
  }
})
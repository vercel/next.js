/* global jest */
jest.autoMockOff()
const Runner = require('jscodeshift/dist/Runner');
const { cp, rm } = require('fs/promises')
const { join } = require('path')

const fixtureDir = join(__dirname, '..', '__testfixtures__', 'next-image-experimental-loader')
const transform = join(__dirname, '..', 'next-image-experimental.js')

it('should work with imgix', async () => {
  try {
    await cp(join(fixtureDir, 'imgix-input'), join(fixtureDir, 'dir-under-test'))
    process.chdir(join(fixtureDir, 'dir-under-test'))
    const result = await Runner.run(transform, [`.`], {})
    expect(result.error).toBe(0)
    //expect(result.ok).toBe(1)
  } finally {
    await rm(join(fixtureDir, 'dir-under-test'), { recursive: true })
  }
})
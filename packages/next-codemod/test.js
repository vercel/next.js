/* global jest */
jest.autoMockOff()
import { defineTest } from 'jscodeshift/dist/testUtils'
import { readdirSync } from 'fs'
import { join } from 'path'

const fixtureDirsPath = join(
  process.cwd(),
  'src',
  'transforms',
  '__testfixtures__'
)

const fixtureDirs = readdirSync(fixtureDirsPath)

fixtureDirs.forEach((dir) => {
  const fixtureDir = join(fixtureDirsPath, dir)
  const fixtures = readdirSync(fixtureDir)
    .filter((file) => file.endsWith('.input.js'))
    .map((file) => file.replace('.input.js', ''))

  fixtures.forEach((fixture) => {
    defineTest(fixtureDirsPath, dir, null, `${dir}/${fixture}`)
  })
})

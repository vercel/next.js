/* global jest */
jest.autoMockOff()
const defineTest = require('jscodeshift/dist/testUtils').defineTest
const { readdirSync } = require('fs')
const { join } = require('path')

const fixtureDir = 'next-image-to-legacy-image'
const fixtureDirPath = join(__dirname, '..', '__testfixtures__', fixtureDir)
const fixtures = readdirSync(fixtureDirPath)
  .filter(file => file.endsWith('.input.js'))
  .map(file => file.replace('.input.js', ''))

for (const fixture of fixtures) {
  const prefix = `${fixtureDir}/${fixture}`;
  defineTest(__dirname, fixtureDir,  null, prefix)
}

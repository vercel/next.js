/* global jest, describe, it, expect */
jest.autoMockOff()
const defineTest = require('jscodeshift/dist/testUtils').defineTest
const jscodeshift = require('jscodeshift')
const { readdirSync, readFileSync } = require('fs')
const { join } = require('path')

const fixtureDir = 'remove-unstable-catch-error-retry'
const fixtureDirPath = join(__dirname, '..', '__testfixtures__', fixtureDir)
const fixtures = readdirSync(fixtureDirPath)
  .filter(file => file.endsWith('.input.tsx'))
  .map(file => file.replace('.input.tsx', ''))

for (const fixture of fixtures) {
  const prefix = `${fixtureDir}/${fixture}`;
  defineTest(__dirname, fixtureDir, null, prefix, { parser: 'tsx' });
}

// Guard: every expected output must be syntactically valid (e.g. no dangling or
// duplicate exports introduced while collapsing/renaming).
describe(`${fixtureDir} outputs are valid syntax`, () => {
  const tsx = jscodeshift.withParser('tsx')
  const outputs = readdirSync(fixtureDirPath).filter(file =>
    file.endsWith('.output.tsx')
  )
  for (const file of outputs) {
    it(`${file} parses`, () => {
      const source = readFileSync(join(fixtureDirPath, file), 'utf8')
      expect(() => tsx(source)).not.toThrow()
    })
  }
})

/* global jest */
jest.autoMockOff()
const defineTest = require('jscodeshift/dist/testUtils').defineTest
const { readdirSync } = require('fs')
const { join } = require('path')

const fixtureDir = 'next-dynamic-access-named-export'
const fixtureDirPath = join(__dirname, '..', '__testfixtures__', fixtureDir)
const fixtures = readdirSync(fixtureDirPath)
  .filter(file => /\.input\.(js|tsx)$/.test(file))

for (const file of fixtures) {
  const fixture = file.replace(/\.input\.(js|tsx)/, '');
  const isTsx = file.endsWith('.tsx')
  const prefix = `${fixtureDir}/${fixture}`;
  defineTest(__dirname, fixtureDir, null, prefix, { parser: isTsx ? 'tsx' : 'babel' });
}
